import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  MANUAL_WEDDING_MOVES,
  WEDDING_STATUSES,
  WEDDING_STATUS_LABELS,
  type ConsentSource,
  type LeadSource,
  type LegStatus,
  type WeddingStatus,
} from '@shubhjets/shared';
import { IsNull, type DataSource, type EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { Client } from '../clients/client.entities.js';
import { ConsentService } from '../clients/consent.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type {
  CreateWeddingInput,
  LegInput,
  UpdateLegInput,
  UpdateWeddingInput,
  WeddingListFilters,
} from './wedding.dto.js';
import {
  Leg,
  LegChoice,
  RateRequestLeg,
  RateResponse,
  RateResponseLeg,
  Wedding,
} from './wedding.entities.js';

const fieldErrors = (fields: Record<string, string>) =>
  new BadRequestException({ message: 'Please fix the highlighted fields', fields });

const PLAIN = [
  'partnerId',
  'venueCity',
  'startsOn',
  'endsOn',
  'leadSource',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmTerm',
  'utmContent',
  'landingPage',
  'notes',
  'requiredPaymentBps',
  'placeOfSupplyState',
  'clientId',
  'businessProfileId',
] as const;

/** Leg statuses the rates flow manages; later ones (quoted, confirmed, flown) belong to later steps. */
const RATE_STAGE: LegStatus[] = ['OPEN', 'RATES_REQUESTED', 'RATES_IN', 'CHOSEN'];

@Injectable()
export class WeddingsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly settings: SettingsService,
    private readonly consents: ConsentService,
    private readonly audit: AuditService,
  ) {}

  async find(id: string, m: EntityManager = this.ds.manager): Promise<Wedding> {
    const w = await m.getRepository(Wedding).findOne({ where: { id, deletedAt: IsNull() } });
    if (!w) throw new NotFoundException('Wedding not found');
    return w;
  }

  private async checkRefs(
    m: EntityManager,
    input: {
      partnerId?: string | null;
      clientId?: string | null;
      businessProfileId?: string | null;
    },
  ) {
    const fields: Record<string, string> = {};
    const exists = async (sql: string, id: string) => (await m.query(sql, [id])).length > 0;
    if (
      input.partnerId &&
      !(await exists(`SELECT 1 FROM partner WHERE id = $1 AND deleted_at IS NULL`, input.partnerId))
    ) {
      fields.partnerId = 'Choose a partner from the list';
    }
    if (
      input.clientId &&
      !(await exists(`SELECT 1 FROM client WHERE id = $1 AND deleted_at IS NULL`, input.clientId))
    ) {
      fields.clientId = 'Choose a client from the list';
    }
    if (
      input.businessProfileId &&
      !(await exists(
        `SELECT 1 FROM business_profile WHERE id = $1 AND archived_at IS NULL`,
        input.businessProfileId,
      ))
    ) {
      fields.businessProfileId = 'Choose an active business profile';
    }
    if (Object.keys(fields).length) throw fieldErrors(fields);
  }

  private async checkAirports(
    m: EntityManager,
    legs: { from?: string; to?: string }[],
    prefix = 'legs',
  ) {
    const codes = [...new Set(legs.flatMap((l) => [l.from, l.to]).filter((c): c is string => !!c))];
    if (!codes.length) return;
    const known: { iata: string }[] = await m.query(
      `SELECT iata FROM airport WHERE iata = ANY($1)`,
      [codes],
    );
    const fields: Record<string, string> = {};
    legs.forEach((l, i) => {
      for (const k of ['from', 'to'] as const) {
        if (l[k] && !known.some((a) => a.iata === l[k]))
          fields[prefix ? `${prefix}.${i}.${k}` : k] = `Unknown airport ${l[k]}`;
      }
    });
    if (Object.keys(fields).length) throw fieldErrors(fields);
  }

  async create(input: CreateWeddingInput, userId: string): Promise<{ id: string; code: string }> {
    return this.ds.transaction(async (m) => {
      if (input.clientId && input.newClient)
        throw fieldErrors({ clientId: 'Choose an existing client or add a new one, not both' });
      await this.checkRefs(m, input);
      await this.checkAirports(m, input.legs);
      let clientId = input.clientId ?? null;
      if (input.newClient) {
        const repo = m.getRepository(Client);
        const c = await repo.save(
          repo.create({
            name: input.newClient.name,
            type: 'FAMILY',
            phone: input.newClient.phone ?? null,
            email: input.newClient.email ?? null,
            gstin: null,
            partnerId: input.partnerId ?? null,
            notes: null,
            deletedAt: null,
            createdBy: userId,
          }),
        );
        clientId = c.id;
        if (input.newClient.consentSource) {
          await this.consents.record(
            {
              subjectType: 'CLIENT',
              subjectId: c.id,
              source: input.newClient.consentSource as ConsentSource,
            },
            m,
          );
        }
      }
      const profile =
        input.businessProfileId ??
        ((await m.query(`SELECT id FROM business_profile WHERE is_default`))[0]?.id as
          string | undefined) ??
        null;
      const repo = m.getRepository(Wedding);
      const w = repo.create({
        status: 'ENQUIRY',
        lostReason: null,
        deletedAt: null,
        createdBy: userId,
        paymentPlanBps: [10_000],
      });
      for (const k of PLAIN)
        (w as unknown as Record<string, unknown>)[k] =
          (input as Record<string, unknown>)[k] ?? null;
      w.clientId = clientId;
      w.businessProfileId = profile;
      w.leadSource =
        (input.leadSource as LeadSource | undefined) ?? (input.partnerId ? 'PARTNER' : 'OTHER');
      w.requiredPaymentBps =
        input.requiredPaymentBps ?? (await this.settings.get<number>('payment.required_bps'));
      const saved = await repo.save(w);
      for (const [i, leg] of input.legs.entries()) await this.insertLeg(m, saved.id, i + 1, leg);
      const fresh = await repo.findOneByOrFail({ id: saved.id });
      return { id: fresh.id, code: fresh.code };
    });
  }

  private insertLeg(m: EntityManager, weddingId: string, seq: number, leg: LegInput) {
    const repo = m.getRepository(Leg);
    return repo.save(
      repo.create({
        weddingId,
        seq,
        fromIata: leg.from,
        toIata: leg.to,
        flightDate: leg.date,
        windowFrom: leg.windowFrom ?? null,
        windowTo: leg.windowTo ?? null,
        pax: leg.pax,
        category: (leg.category as Leg['category']) ?? null,
        status: 'OPEN',
        notes: leg.notes ?? null,
      }),
    );
  }

  /** The board: every wedding with its money from the accepted (or latest) quote. */
  async list(f: WeddingListFilters) {
    const where = ['w.deleted_at IS NULL'];
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    if (f.status?.length) where.push(`w.status = ANY(${p(f.status)})`);
    if (f.partnerId) where.push(`w.partner_id = ${p(f.partnerId)}`);
    if (f.q) {
      const like = p(`%${f.q.replace(/[%_\\]/g, '\\$&')}%`);
      where.push(
        `(w.code ILIKE ${like} OR c.name ILIKE ${like} OR w.venue_city ILIKE ${like} OR pa.firm ILIKE ${like})`,
      );
    }
    const rows: Record<string, unknown>[] = await this.ds.query(
      `SELECT w.id, w.code, w.status, w.venue_city, w.starts_on, w.ends_on, w.lead_source, w.lost_reason,
              pa.id AS partner_id, pa.firm AS partner_firm, c.id AS client_id, c.name AS client_name,
              (SELECT count(*)::int FROM leg l WHERE l.wedding_id = w.id) AS legs,
              (SELECT coalesce(sum(l.pax), 0)::int FROM leg l WHERE l.wedding_id = w.id) AS pax,
              (SELECT min(l.flight_date) FROM leg l WHERE l.wedding_id = w.id AND l.status <> 'CANCELLED') AS first_flight,
              q.totals, q.status AS quote_status
         FROM wedding w
         LEFT JOIN partner pa ON pa.id = w.partner_id
         LEFT JOIN client c ON c.id = w.client_id
         LEFT JOIN LATERAL (SELECT totals, status FROM quote q WHERE q.wedding_id = w.id
                             ORDER BY (q.status = 'ACCEPTED') DESC, q.version DESC LIMIT 1) q ON true
        WHERE ${where.join(' AND ')}
        ORDER BY coalesce((SELECT min(l.flight_date) FROM leg l WHERE l.wedding_id = w.id), w.starts_on) ASC NULLS LAST, w.number`,
      params,
    );
    const counts: { status: WeddingStatus; n: number }[] = await this.ds.query(
      `SELECT status, count(*)::int AS n FROM wedding WHERE deleted_at IS NULL GROUP BY status`,
    );
    return {
      items: rows.map((r) => {
        const t = r.totals as { sellSubtotal?: number; margin?: number } | null;
        return {
          id: r.id,
          code: r.code,
          status: r.status,
          venueCity: r.venue_city,
          startsOn: r.starts_on,
          endsOn: r.ends_on,
          firstFlight: r.first_flight,
          leadSource: r.lead_source,
          lostReason: r.lost_reason,
          partner: r.partner_id ? { id: r.partner_id, firm: r.partner_firm } : null,
          client: r.client_id ? { id: r.client_id, name: r.client_name } : null,
          legs: r.legs,
          pax: r.pax,
          quoteStatus: r.quote_status ?? null,
          value: t?.sellSubtotal ?? null,
          margin: t?.margin ?? null,
        };
      }),
      counts: Object.fromEntries(
        WEDDING_STATUSES.map((s) => [s, counts.find((c) => c.status === s)?.n ?? 0]),
      ),
    };
  }

  async get(id: string) {
    const w = await this.find(id);
    const [partner] = w.partnerId
      ? await this.ds.query(
          `SELECT id, firm, phone, commission_basis AS "commissionBasis", commission_bps AS "commissionBps" FROM partner WHERE id = $1`,
          [w.partnerId],
        )
      : [null];
    const [client] = w.clientId
      ? await this.ds.query(`SELECT id, name, phone, email FROM client WHERE id = $1`, [w.clientId])
      : [null];
    const [profile] = w.businessProfileId
      ? await this.ds.query(`SELECT id, label FROM business_profile WHERE id = $1`, [
          w.businessProfileId,
        ])
      : [null];
    const legs = await this.ds
      .getRepository(Leg)
      .find({ where: { weddingId: id }, order: { seq: 'ASC' } });
    return {
      id: w.id,
      code: w.code,
      status: w.status,
      lostReason: w.lostReason,
      venueCity: w.venueCity,
      startsOn: w.startsOn,
      endsOn: w.endsOn,
      leadSource: w.leadSource,
      utm: {
        source: w.utmSource,
        medium: w.utmMedium,
        campaign: w.utmCampaign,
        term: w.utmTerm,
        content: w.utmContent,
      },
      landingPage: w.landingPage,
      notes: w.notes,
      requiredPaymentBps: w.requiredPaymentBps,
      placeOfSupplyState: w.placeOfSupplyState,
      partner: partner ?? null,
      client: client ?? null,
      businessProfile: profile ?? null,
      manualMoves: MANUAL_WEDDING_MOVES[w.status] ?? [],
      legs,
      createdAt: w.createdAt,
    };
  }

  async update(id: string, input: UpdateWeddingInput): Promise<void> {
    await this.ds.transaction(async (m) => {
      const w = await this.find(id, m);
      await this.checkRefs(m, input);
      for (const k of PLAIN) {
        const v = (input as Record<string, unknown>)[k];
        if (v === undefined || ((k === 'leadSource' || k === 'requiredPaymentBps') && v === null))
          continue;
        (w as unknown as Record<string, unknown>)[k] = v;
      }
      if (w.startsOn && w.endsOn && w.endsOn < w.startsOn)
        throw fieldErrors({ endsOn: 'The last day must be on or after the first day' });
      await m.getRepository(Wedding).save(w);
    });
  }

  /** Statuses you change by hand: mark lost (with a reason), or reopen a lost wedding. */
  async move(id: string, to: WeddingStatus, reason?: string): Promise<void> {
    await this.ds.transaction(async (m) => {
      const w = await this.find(id, m);
      if (!(MANUAL_WEDDING_MOVES[w.status] ?? []).includes(to)) {
        throw new ConflictException(
          `A wedding that is "${WEDDING_STATUS_LABELS[w.status]}" can't be moved to "${WEDDING_STATUS_LABELS[to]}" by hand`,
        );
      }
      if (to === 'LOST') {
        w.lostReason = reason ?? null;
      } else {
        w.lostReason = null;
      }
      w.status = to;
      await m.getRepository(Wedding).save(w);
      if (to === 'ENQUIRY') await this.refreshAfterReopen(m, id);
    });
  }

  private async refreshAfterReopen(m: EntityManager, weddingId: string) {
    const [req] = await m.query(`SELECT 1 FROM rate_request WHERE wedding_id = $1 LIMIT 1`, [
      weddingId,
    ]);
    if (req) {
      const w = await this.find(weddingId, m);
      w.status = 'RATES_REQUESTED';
      await m.getRepository(Wedding).save(w);
    }
  }

  // ---------- Legs ----------

  private async findLeg(m: EntityManager, legId: string): Promise<Leg> {
    const leg = await m.getRepository(Leg).findOneBy({ id: legId });
    if (!leg) throw new NotFoundException('Leg not found');
    return leg;
  }

  private assertEditable(w: Wedding) {
    if (['SIGNED_AND_PAID', 'FLYING', 'DONE'].includes(w.status)) {
      throw new ConflictException(
        'This wedding is confirmed; its legs can no longer be changed here',
      );
    }
  }

  async addLeg(weddingId: string, input: LegInput): Promise<Leg> {
    return this.ds.transaction(async (m) => {
      const w = await this.find(weddingId, m);
      this.assertEditable(w);
      await this.checkAirports(m, [input], '');
      const [{ max }] = await m.query(
        `SELECT coalesce(max(seq), 0)::int AS max FROM leg WHERE wedding_id = $1`,
        [weddingId],
      );
      return this.insertLeg(m, weddingId, max + 1, input);
    });
  }

  async updateLeg(legId: string, input: UpdateLegInput): Promise<Leg> {
    return this.ds.transaction(async (m) => {
      const leg = await this.findLeg(m, legId);
      this.assertEditable(await this.find(leg.weddingId, m));
      await this.checkAirports(m, [{ from: input.from, to: input.to }], '');
      const next = {
        fromIata: input.from ?? leg.fromIata,
        toIata: input.to ?? leg.toIata,
        flightDate: input.date ?? leg.flightDate,
        windowFrom: input.windowFrom === undefined ? leg.windowFrom : input.windowFrom,
        windowTo: input.windowTo === undefined ? leg.windowTo : input.windowTo,
        pax: input.pax ?? leg.pax,
        category:
          input.category === undefined
            ? leg.category
            : ((input.category as Leg['category']) ?? null),
        notes: input.notes === undefined ? leg.notes : input.notes,
      };
      if (next.fromIata === next.toIata)
        throw fieldErrors({ to: 'Arrival must differ from departure' });
      if (next.windowFrom && next.windowTo && next.windowTo <= next.windowFrom)
        throw fieldErrors({ windowTo: 'The window must end after it starts' });
      Object.assign(leg, next);
      const saved = await m.getRepository(Leg).save(leg);
      // More passengers than the chosen jets can seat: the choice no longer works.
      const [seats] = await m.query(
        `SELECT coalesce(sum(r.seats), 0)::int AS seats, count(*)::int AS n FROM leg_choice lc JOIN rate_response r ON r.id = lc.rate_response_id WHERE lc.leg_id = $1`,
        [legId],
      );
      if (seats.n > 0 && seats.seats < saved.pax) {
        await m.getRepository(LegChoice).delete({ legId });
        await this.audit.record(
          {
            entity: 'leg',
            entityId: legId,
            action: 'CHOICE_CLEARED',
            diff: { reason: `Chosen jets seat ${seats.seats}, leg now needs ${saved.pax}` },
          },
          m,
        );
        await this.refreshLegStatus(m, legId);
      }
      return m.getRepository(Leg).findOneByOrFail({ id: legId });
    });
  }

  async deleteLeg(legId: string): Promise<void> {
    await this.ds.transaction(async (m) => {
      const leg = await this.findLeg(m, legId);
      this.assertEditable(await this.find(leg.weddingId, m));
      const [quoted] = await m.query(`SELECT 1 FROM quote_line WHERE leg_id = $1 LIMIT 1`, [legId]);
      if (quoted)
        throw new ConflictException(
          'This leg is on a quote. Make a new quote version without it first.',
        );
      const covering = await m.getRepository(RateResponseLeg).find({ where: { legId } });
      await m.getRepository(LegChoice).delete({ legId });
      await m.getRepository(RateRequestLeg).delete({ legId });
      await m.getRepository(RateResponseLeg).delete({ legId });
      // A reply that only covered this leg has nothing left to price.
      for (const c of covering) {
        const left = await m
          .getRepository(RateResponseLeg)
          .count({ where: { rateResponseId: c.rateResponseId } });
        if (left === 0) await m.getRepository(RateResponse).delete({ id: c.rateResponseId });
      }
      await m.getRepository(Leg).remove(leg);
      // Renumber the remaining legs 1, 2, 3…
      const rest = await m
        .getRepository(Leg)
        .find({ where: { weddingId: leg.weddingId }, order: { seq: 'ASC' } });
      await m.query(`UPDATE leg SET seq = seq + 1000 WHERE wedding_id = $1`, [leg.weddingId]);
      for (const [i, l] of rest.entries())
        await m.query(`UPDATE leg SET seq = $1 WHERE id = $2`, [i + 1, l.id]);
    });
  }

  /** Recompute a leg's rates-stage status from requests, replies and choices (later stages untouched). */
  async refreshLegStatus(m: EntityManager, legId: string): Promise<void> {
    const leg = await this.findLeg(m, legId);
    if (!RATE_STAGE.includes(leg.status)) return;
    const [r] = await m.query(
      `SELECT EXISTS (SELECT 1 FROM leg_choice WHERE leg_id = $1) AS chosen,
              EXISTS (SELECT 1 FROM rate_response_leg WHERE leg_id = $1) AS rates,
              EXISTS (SELECT 1 FROM rate_request_leg WHERE leg_id = $1) AS requested`,
      [legId],
    );
    const status: LegStatus = r.chosen
      ? 'CHOSEN'
      : r.rates
        ? 'RATES_IN'
        : r.requested
          ? 'RATES_REQUESTED'
          : 'OPEN';
    if (status !== leg.status) {
      leg.status = status;
      await m.getRepository(Leg).save(leg);
    }
  }

  /** First rate request moves an enquiry to "Rates requested". */
  async markRatesRequested(m: EntityManager, weddingId: string): Promise<void> {
    const w = await this.find(weddingId, m);
    if (w.status === 'ENQUIRY') {
      w.status = 'RATES_REQUESTED';
      await m.getRepository(Wedding).save(w);
    }
  }
}
