import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  ENQUIRY_ROLE_LABELS,
  addDays,
  cityToIata,
  parseGuestOrigins,
  toIstDate,
  websiteLeadSource,
  type EnquiryRole,
} from '@shubhjets/shared';
import { IsNull, type DataSource, type EntityManager } from 'typeorm';
import { Client } from '../clients/client.entities.js';
import { ConsentService } from '../clients/consent.service.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { PartnerActivity } from '../partners/partner.entities.js';
import { PartnersService } from '../partners/partners.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { Leg, Wedding } from '../weddings/wedding.entities.js';
import type { EnquiryInput, PartnerSignupInput, TapInput } from './enquiry.dto.js';

/** Forms filled faster than this are almost always bots. */
export const MIN_FILL_MS = 2_500;
/** The same person sending the same enquiry again within this window joins the first one. */
const REPEAT_WINDOW_HOURS = 24;

type Source = 'WEBSITE' | 'PARTNER_SIGNUP' | 'WHATSAPP_TAP' | 'CALL_TAP';

const ATTRIBUTION_KEYS = [
  'page',
  'leadSource',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmTerm',
  'utmContent',
  'gclid',
] as const;

/** What we keep of a form: everything except the spam traps and the consent tick (recorded separately). */
function withoutTraps<
  T extends { companyWebsite?: unknown; elapsedMs?: unknown; consent?: unknown },
>(input: T): Omit<T, 'companyWebsite' | 'elapsedMs' | 'consent'> {
  const copy: Partial<T> = { ...input };
  delete copy.companyWebsite;
  delete copy.elapsedMs;
  delete copy.consent;
  return copy as Omit<T, 'companyWebsite' | 'elapsedMs' | 'consent'>;
}

const fieldErrors = (fields: Record<string, string>) =>
  new BadRequestException({ message: 'Please fix the highlighted fields', fields });

/**
 * Website enquiries (BRIEF.md §5.7, WEBSITE.md): the enquiry form, the partner sign-up form and
 * WhatsApp/call taps. A real enquiry becomes a wedding in "Enquiry" with its client or partner,
 * consent, lead source and UTM, and draft legs where the cities are clear.
 */
@Injectable()
export class EnquiriesService {
  now: () => Date = () => new Date();
  private readonly ipSalt: string;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly consents: ConsentService,
    private readonly partners: PartnersService,
    private readonly settings: SettingsService,
  ) {
    this.ipSalt = createHash('sha256').update(`enquiry-ip:${config.JWT_SECRET}`).digest('hex');
  }

  /** IPs are kept only as a salted hash, enough to spot floods from one network. */
  hashIp(ip: string | undefined): string | null {
    return ip
      ? createHash('sha256').update(`${this.ipSalt}:${ip}`).digest('hex').slice(0, 32)
      : null;
  }

  private spamReason(input: { companyWebsite?: string | null; elapsedMs?: number | null }) {
    if (input.companyWebsite?.trim()) return 'HONEYPOT';
    if (input.elapsedMs != null && input.elapsedMs < MIN_FILL_MS) return 'TOO_FAST';
    return null;
  }

  private attribution(input: Partial<Record<(typeof ATTRIBUTION_KEYS)[number], string | null>>) {
    return Object.fromEntries(
      ATTRIBUTION_KEYS.map((k) => [k, input[k] ?? null]).filter(([, v]) => v),
    ) as Record<string, string>;
  }

  private async insertRow(
    m: EntityManager,
    row: {
      source: Source;
      rawText?: string | null;
      payload: object;
      ipHash: string | null;
      spamReason?: string | null;
      weddingId?: string | null;
      clientId?: string | null;
      partnerId?: string | null;
      dedupeKey?: string | null;
    },
  ): Promise<string> {
    const [r] = await m.query(
      `INSERT INTO enquiry (source, raw_text, payload, honeypot_hit, spam_reason, ip_hash,
                            wedding_id, client_id, partner_id, dedupe_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        row.source,
        row.rawText ?? null,
        JSON.stringify(row.payload),
        !!row.spamReason,
        row.spamReason ?? null,
        row.ipHash,
        row.weddingId ?? null,
        row.clientId ?? null,
        row.partnerId ?? null,
        row.dedupeKey ?? null,
        this.now(),
      ],
    );
    return r.id as string;
  }

  /** The enquiry form. Spam is stored (for counting) but answered exactly like a real enquiry. */
  async submit(input: EnquiryInput, ip: string | undefined): Promise<{ ok: true }> {
    const clean = withoutTraps(input);
    const ipHash = this.hashIp(ip);
    const spam = this.spamReason(input);
    if (spam) {
      await this.insertRow(this.ds.manager, {
        source: 'WEBSITE',
        rawText: input.message ?? null,
        payload: clean,
        ipHash,
        spamReason: spam,
      });
      return { ok: true };
    }
    const today = toIstDate(this.now());
    if (input.weddingDate && input.weddingDate < today)
      throw fieldErrors({ weddingDate: 'Choose a date from today on' });
    if (input.weddingDate && input.weddingDate > addDays(today, 3 * 366))
      throw fieldErrors({ weddingDate: 'Choose a date within the next 3 years' });
    if (input.role !== 'FAMILY' && !input.firm?.trim())
      throw fieldErrors({ firm: 'Enter your firm or hotel name' });

    const dedupeKey = createHash('sha256')
      .update(
        [
          input.phone,
          input.role,
          input.weddingCity?.toLowerCase() ?? '',
          input.weddingDate ?? '',
        ].join('|'),
      )
      .digest('hex');

    await this.ds.transaction(async (m) => {
      // Wait for any identical submission in flight, so a double tap makes one wedding.
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [dedupeKey]);
      const [repeat] = await m.query(
        `SELECT wedding_id, client_id, partner_id FROM enquiry
          WHERE dedupe_key = $1 AND wedding_id IS NOT NULL
            AND created_at > $2::timestamptz - make_interval(hours => $3)
          ORDER BY created_at DESC LIMIT 1`,
        [dedupeKey, this.now(), REPEAT_WINDOW_HOURS],
      );
      if (repeat) {
        await this.insertRow(m, {
          source: 'WEBSITE',
          rawText: input.message ?? null,
          payload: { ...clean, repeat: true },
          ipHash,
          weddingId: repeat.wedding_id,
          clientId: repeat.client_id,
          partnerId: repeat.partner_id,
          dedupeKey,
        });
        return;
      }

      const who =
        input.role === 'FAMILY'
          ? { clientId: await this.matchClient(m, input), partnerId: null }
          : { clientId: null, partnerId: await this.matchPartner(m, input, today) };

      const leadSource = websiteLeadSource({
        leadSource: input.leadSource,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        gclid: input.gclid,
      });
      const profile =
        ((await m.query(`SELECT id FROM business_profile WHERE is_default`))[0]?.id as
          string | undefined) ?? null;
      const repo = m.getRepository(Wedding);
      const w = await repo.save(
        repo.create({
          status: 'ENQUIRY',
          lostReason: null,
          deletedAt: null,
          createdBy: null,
          paymentPlanBps: [10_000],
          requiredPaymentBps: await this.settings.get<number>('payment.required_bps'),
          businessProfileId: profile,
          clientId: who.clientId,
          partnerId: who.partnerId,
          venueCity: input.weddingCity ?? null,
          startsOn: input.weddingDate ?? null,
          endsOn: input.weddingDate ?? null,
          leadSource,
          utmSource: input.utmSource ?? null,
          utmMedium: input.utmMedium ?? null,
          utmCampaign: input.utmCampaign ?? null,
          utmTerm: input.utmTerm ?? null,
          utmContent: input.utmContent ?? null,
          landingPage: input.page ?? null,
          notes: this.notes(input),
          placeOfSupplyState: null,
        }),
      );
      await this.draftLegs(m, w.id, input);
      await this.insertRow(m, {
        source: 'WEBSITE',
        rawText: input.message ?? null,
        payload: clean,
        ipHash,
        weddingId: w.id,
        clientId: who.clientId,
        partnerId: who.partnerId,
        dedupeKey,
      });
    });
    return { ok: true };
  }

  private notes(input: EnquiryInput): string {
    const lines = [`Website enquiry from ${input.name} (${ENQUIRY_ROLE_LABELS[input.role]}).`];
    if (input.role !== 'FAMILY' && input.firm) lines.push(`Firm: ${input.firm}`);
    if (input.guests) lines.push(`Guests flying: ${input.guests}`);
    if (input.guestsFrom) lines.push(`Flying from: ${input.guestsFrom}`);
    if (input.message) lines.push(`Message: ${input.message}`);
    return lines.join('\n');
  }

  /** Families: the client with this phone number, or a new one. Consent is recorded each time. */
  private async matchClient(m: EntityManager, input: EnquiryInput): Promise<string> {
    const repo = m.getRepository(Client);
    let c = await repo.findOne({
      where: { phone: input.phone!, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
    if (c) {
      if (!c.email && input.email) {
        c.email = input.email;
        await repo.save(c);
      }
    } else {
      c = await repo.save(
        repo.create({
          name: input.name,
          type: 'FAMILY',
          phone: input.phone!,
          email: input.email ?? null,
          gstin: null,
          address: null,
          partnerId: null,
          notes: null,
          deletedAt: null,
          createdBy: null,
        }),
      );
    }
    await this.consents.record(
      { subjectType: 'CLIENT', subjectId: c.id, source: 'WEBSITE_FORM' },
      m,
    );
    return c.id;
  }

  /** Planners and hotels: the partner with this phone or email, or a new one to follow up today. */
  private async matchPartner(
    m: EntityManager,
    input: {
      name: string;
      firm?: string | null;
      role: EnquiryRole | 'PLANNER' | 'HOTEL';
      phone?: string | null;
      email?: string | null;
      city?: string | null;
      instagram?: string | null;
      message?: string | null;
      page?: string | null;
    },
    today: string,
    activityNote?: string,
  ): Promise<string> {
    const [match] = await this.partners.findDuplicates(
      { phone: input.phone, email: input.email },
      undefined,
      m,
    );
    let id: string;
    if (match) {
      id = match.id;
      await m.query(
        `UPDATE partner SET next_follow_up_on = LEAST(coalesce(next_follow_up_on, $2::date), $2::date),
                            status = CASE WHEN status = 'IMPORTED' THEN 'CONTACTED' ELSE status END
          WHERE id = $1`,
        [id, today],
      );
    } else {
      const created = await this.partners.create(
        {
          type: input.role === 'HOTEL' ? 'HOTEL' : 'PLANNER',
          firm: input.firm?.trim() || input.name,
          contactPerson: input.name,
          phone: input.phone ?? null,
          email: input.email ?? null,
          city: input.city ?? null,
          instagram: input.instagram ?? null,
          sourceLink: null,
          website: null,
          fitNote: null,
          notes: null,
          address: null,
          gstin: null,
          status: 'CONTACTED',
          nextFollowUpOn: today,
        },
        null,
        m,
      );
      id = created.id;
    }
    const act = m.getRepository(PartnerActivity);
    await act.save(
      act.create({
        partnerId: id,
        kind: 'NOTE',
        note: activityNote ?? 'Sent a wedding enquiry from the website.',
        at: this.now(),
        createdBy: null,
      }),
    );
    await this.consents.record(
      { subjectType: 'PARTNER', subjectId: id, source: 'WEBSITE_FORM' },
      m,
    );
    return id;
  }

  /**
   * One draft leg per city the guests fly from, when both airports are clear and the date is
   * known: the day before the wedding, times and aircraft to confirm on the call.
   */
  private async draftLegs(m: EntityManager, weddingId: string, input: EnquiryInput) {
    if (!input.weddingDate) return;
    const known: string[] = (await m.query(`SELECT iata FROM airport`)).map(
      (r: { iata: string }) => r.iata,
    );
    const to = cityToIata(input.weddingCity, known);
    if (!to) return;
    const origins = parseGuestOrigins(input.guestsFrom)
      .map((o) => ({ ...o, from: cityToIata(o.city, known) }))
      .filter((o): o is typeof o & { from: string } => !!o.from && o.from !== to);
    const seen = new Set<string>();
    const legs = origins.filter((o) => !seen.has(o.from) && seen.add(o.from));
    const date = addDays(input.weddingDate, -1);
    const repo = m.getRepository(Leg);
    for (const [i, o] of legs.entries()) {
      const pax = o.guests ?? (legs.length === 1 ? input.guests : null);
      if (!pax) continue;
      await repo.save(
        repo.create({
          weddingId,
          seq: i + 1,
          fromIata: o.from,
          toIata: to,
          flightDate: date,
          windowFrom: null,
          windowTo: null,
          pax: Math.min(pax, 200),
          category: null,
          status: 'OPEN',
          notes: 'From the website form: date, time and aircraft to confirm on the call.',
        }),
      );
    }
  }

  /** The "For planners & hotels" form: a partner to follow up today. */
  async partnerSignup(input: PartnerSignupInput, ip: string | undefined): Promise<{ ok: true }> {
    const clean = withoutTraps(input);
    const ipHash = this.hashIp(ip);
    const spam = this.spamReason(input);
    if (spam) {
      await this.insertRow(this.ds.manager, {
        source: 'PARTNER_SIGNUP',
        rawText: input.message ?? null,
        payload: clean,
        ipHash,
        spamReason: spam,
      });
      return { ok: true };
    }
    const today = toIstDate(this.now());
    await this.ds.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`partner:${input.phone}`]);
      const note = [
        'Signed up as a partner on the website.',
        input.weddingsPerYear != null ? `Weddings a year: ${input.weddingsPerYear}.` : null,
        input.message ? `Message: ${input.message}` : null,
      ]
        .filter(Boolean)
        .join(' ');
      const partnerId = await this.matchPartner(m, input, today, note);
      await this.insertRow(m, {
        source: 'PARTNER_SIGNUP',
        rawText: input.message ?? null,
        payload: clean,
        ipHash,
        partnerId,
      });
    });
    return { ok: true };
  }

  /** A WhatsApp or call button tap, counted per lead source for the Today screen and reports. */
  async tap(input: TapInput, ip: string | undefined): Promise<void> {
    await this.insertRow(this.ds.manager, {
      source: input.kind === 'WHATSAPP' ? 'WHATSAPP_TAP' : 'CALL_TAP',
      payload: { ...this.attribution(input), leadSource: websiteLeadSource(input) },
      ipHash: this.hashIp(ip),
    });
  }

  /** What the website sent for a wedding (shown on its Overview tab). */
  async forWedding(weddingId: string) {
    const rows: {
      id: string;
      payload: Record<string, unknown>;
      created_at: Date;
    }[] = await this.ds.query(
      `SELECT id, payload, created_at FROM enquiry
        WHERE wedding_id = $1 AND source = 'WEBSITE' ORDER BY created_at ASC`,
      [weddingId],
    );
    if (!rows.length) return null;
    const first = rows[0]!.payload;
    const pick = (k: string) => (typeof first[k] === 'string' ? (first[k] as string) : null);
    return {
      receivedAt: rows[0]!.created_at,
      repeats: rows.length - 1,
      lastAt: rows[rows.length - 1]!.created_at,
      name: pick('name'),
      role: pick('role') as EnquiryRole | null,
      firm: pick('firm'),
      phone: pick('phone'),
      email: pick('email'),
      weddingCity: pick('weddingCity'),
      weddingDate: pick('weddingDate'),
      guests: typeof first.guests === 'number' ? first.guests : null,
      guestsFrom: pick('guestsFrom'),
      message: pick('message'),
      page: pick('page'),
      gclid: !!pick('gclid'),
      /** Ticked the separate box for news and offers. */
      marketing: first.marketingConsent === true,
    };
  }

  /** Website activity for a period: enquiries, partner sign-ups, taps and spam caught. */
  async summary(days = 30) {
    const since = new Date(this.now().getTime() - days * 86_400_000);
    const rows: { source: Source; spam: boolean; lead: string | null; n: number }[] =
      await this.ds.query(
        `SELECT source, honeypot_hit AS spam,
                coalesce(w.lead_source, e.payload->>'leadSource') AS lead, count(*)::int AS n
           FROM enquiry e LEFT JOIN wedding w ON w.id = e.wedding_id
          WHERE e.created_at >= $1 AND e.source <> 'PASTE'
            AND NOT coalesce((e.payload->>'repeat')::boolean, false)
          GROUP BY 1, 2, 3`,
        [since],
      );
    const sum = (f: (r: (typeof rows)[number]) => boolean) =>
      rows.filter(f).reduce((a, r) => a + r.n, 0);
    const bySource: Record<string, { enquiries: number; taps: number }> = {};
    for (const r of rows) {
      if (r.spam || !r.lead || r.source === 'PARTNER_SIGNUP') continue;
      const b = (bySource[r.lead] ??= { enquiries: 0, taps: 0 });
      if (r.source === 'WEBSITE') b.enquiries += r.n;
      else b.taps += r.n;
    }
    return {
      days,
      enquiries: sum((r) => r.source === 'WEBSITE' && !r.spam),
      partnerSignups: sum((r) => r.source === 'PARTNER_SIGNUP' && !r.spam),
      whatsappTaps: sum((r) => r.source === 'WHATSAPP_TAP'),
      callTaps: sum((r) => r.source === 'CALL_TAP'),
      spamCaught: sum((r) => r.spam),
      bySource,
    };
  }
}
