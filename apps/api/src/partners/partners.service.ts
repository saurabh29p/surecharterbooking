import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  PARTNER_STATUSES,
  seasonRange,
  statusAfterActivity,
  toIstDate,
  websiteDomain,
  type ActivityKind,
  type CommissionDefault,
  type PartnerStatus,
} from '@shubhjets/shared';
import { IsNull, type DataSource, type EntityManager } from 'typeorm';
import { ConsentService } from '../clients/consent.service.js';
import { FilesService } from '../files/files.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type {
  ActivityInput,
  PartnerInput,
  PartnerListFilters,
  UpdatePartnerInput,
} from './partner.dto.js';
import { Partner, PartnerActivity } from './partner.entities.js';

export interface PartnerStats {
  /** Weddings this partner brought in during the current season (financial year). */
  weddingsThisSeason: number;
  /** Sell value (ex-GST) of their booked weddings this season, in paise. */
  bookingsValue: number;
  /** Commission on their booked weddings (all time), in paise. */
  commissionEarned: number;
  commissionPaid: number;
  commissionOwed: number;
}

export interface DuplicateMatch {
  id: string;
  firm: string;
  matchedOn: ('phone' | 'email' | 'website')[];
}

const BOOKED = ['SIGNED_AND_PAID', 'FLYING', 'DONE'];
const EMPTY_STATS: PartnerStats = {
  weddingsThisSeason: 0,
  bookingsValue: 0,
  commissionEarned: 0,
  commissionPaid: 0,
  commissionOwed: 0,
};

const FIELDS = [
  'type',
  'firm',
  'city',
  'address',
  'gstin',
  'contactPerson',
  'phone',
  'email',
  'website',
  'instagram',
  'sourceLink',
  'fitNote',
  'notes',
  'status',
  'commissionBasis',
  'commissionBps',
  'nextFollowUpOn',
] as const;

@Injectable()
export class PartnersService {
  now: () => Date = () => new Date();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly settings: SettingsService,
    private readonly files: FilesService,
    private readonly consents: ConsentService,
  ) {}

  private today() {
    return toIstDate(this.now());
  }

  async find(id: string, m: EntityManager = this.ds.manager): Promise<Partner> {
    const p = await m.getRepository(Partner).findOne({ where: { id, deletedAt: IsNull() } });
    if (!p) throw new NotFoundException('Partner not found');
    return p;
  }

  /** Season figures and commission for some or all partners. */
  async stats(ids?: string[]): Promise<Map<string, PartnerStats>> {
    const season = seasonRange(this.today());
    const rows: Record<string, string | number>[] = await this.ds.query(
      `WITH w AS (
         SELECT w.partner_id, w.status, w.starts_on,
                coalesce((q.totals->>'sellSubtotal')::bigint, 0) AS sell,
                coalesce((q.totals->>'commission')::bigint, 0) AS commission
           FROM wedding w
           LEFT JOIN quote q ON q.wedding_id = w.id AND q.status = 'ACCEPTED'
          WHERE w.deleted_at IS NULL AND w.partner_id IS NOT NULL ${ids ? 'AND w.partner_id = ANY($4)' : ''}
       ), paid AS (
         SELECT partner_id, sum(amount) AS paid FROM payment
          WHERE direction = 'PARTNER_OUT' AND status = 'PAID' AND deleted_at IS NULL GROUP BY partner_id
       )
       SELECT w.partner_id,
              count(*) FILTER (WHERE w.starts_on BETWEEN $1 AND $2)::int AS weddings_season,
              coalesce(sum(w.sell) FILTER (WHERE w.status = ANY($3) AND w.starts_on BETWEEN $1 AND $2), 0) AS bookings_value,
              coalesce(sum(w.commission) FILTER (WHERE w.status = ANY($3)), 0) AS earned,
              coalesce(max(paid.paid), 0) AS paid
         FROM w LEFT JOIN paid ON paid.partner_id = w.partner_id
        GROUP BY w.partner_id`,
      ids ? [season.from, season.to, BOOKED, ids] : [season.from, season.to, BOOKED],
    );
    const out = new Map<string, PartnerStats>();
    for (const r of rows) {
      const earned = Number(r.earned);
      const paid = Number(r.paid);
      out.set(String(r.partner_id), {
        weddingsThisSeason: Number(r.weddings_season),
        bookingsValue: Number(r.bookings_value),
        commissionEarned: earned,
        commissionPaid: paid,
        commissionOwed: Math.max(0, earned - paid),
      });
    }
    return out;
  }

  async list(f: PartnerListFilters) {
    const today = this.today();
    const qb = this.ds
      .getRepository(Partner)
      .createQueryBuilder('p')
      .where('p.deleted_at IS NULL')
      .orderBy('p.next_follow_up_on', 'ASC', 'NULLS LAST')
      .addOrderBy('p.firm', 'ASC');
    if (f.status?.length) qb.andWhere('p.status = ANY(:status)', { status: f.status });
    if (f.type) qb.andWhere('p.type = :type', { type: f.type });
    if (f.followUpDue) qb.andWhere('p.next_follow_up_on <= :today', { today });
    if (f.q) {
      qb.andWhere(
        '(p.firm ILIKE :q OR p.city ILIKE :q OR p.contact_person ILIKE :q OR p.phone ILIKE :q)',
        {
          q: `%${f.q.replace(/[%_\\]/g, '\\$&')}%`,
        },
      );
    }
    const partners = await qb.getMany();
    const ids = partners.map((p) => p.id);
    const [stats, last, countsRows, dueRow] = await Promise.all([
      this.stats(),
      ids.length
        ? (this.ds.query(
            `SELECT DISTINCT ON (partner_id) partner_id, kind, at FROM partner_activity WHERE partner_id = ANY($1) ORDER BY partner_id, at DESC`,
            [ids],
          ) as Promise<{ partner_id: string; kind: ActivityKind; at: Date }[]>)
        : Promise.resolve([]),
      this.ds.query(
        `SELECT status, count(*)::int AS n FROM partner WHERE deleted_at IS NULL GROUP BY status`,
      ) as Promise<{ status: PartnerStatus; n: number }[]>,
      this.ds.query(
        `SELECT count(*)::int AS n FROM partner WHERE deleted_at IS NULL AND next_follow_up_on <= $1`,
        [today],
      ) as Promise<{ n: number }[]>,
    ]);
    const counts = Object.fromEntries(
      PARTNER_STATUSES.map((s) => [s, countsRows.find((r) => r.status === s)?.n ?? 0]),
    );
    return {
      items: partners.map((p) => ({
        ...this.view(p),
        followUpDue: !!p.nextFollowUpOn && p.nextFollowUpOn <= today,
        lastActivity: last.find((l) => l.partner_id === p.id) ?? null,
        stats: stats.get(p.id) ?? EMPTY_STATS,
      })),
      counts,
      followUpsDue: dueRow[0]?.n ?? 0,
    };
  }

  private view(p: Partner) {
    return {
      id: p.id,
      type: p.type,
      firm: p.firm,
      city: p.city,
      address: p.address,
      gstin: p.gstin,
      contactPerson: p.contactPerson,
      phone: p.phone,
      email: p.email,
      website: p.website,
      instagram: p.instagram,
      sourceLink: p.sourceLink,
      fitNote: p.fitNote,
      notes: p.notes,
      status: p.status,
      commissionBasis: p.commissionBasis,
      commissionBps: p.commissionBps,
      referralSigned: p.referralSigned,
      referralFileId: p.referralFileId,
      nextFollowUpOn: p.nextFollowUpOn,
      createdAt: p.createdAt,
    };
  }

  async get(id: string) {
    const p = await this.find(id);
    const [activities, stats, clients, weddings] = await Promise.all([
      this.ds
        .getRepository(PartnerActivity)
        .find({ where: { partnerId: id }, order: { at: 'DESC' }, take: 100 }),
      this.stats([id]),
      this.ds.query(
        `SELECT id, name, phone FROM client WHERE partner_id = $1 AND deleted_at IS NULL ORDER BY name`,
        [id],
      ),
      this.ds.query(
        `SELECT id, code, status, venue_city, starts_on FROM wedding WHERE partner_id = $1 AND deleted_at IS NULL ORDER BY starts_on DESC NULLS LAST`,
        [id],
      ),
    ]);
    const today = this.today();
    return {
      ...this.view(p),
      followUpDue: !!p.nextFollowUpOn && p.nextFollowUpOn <= today,
      activities,
      stats: stats.get(id) ?? EMPTY_STATS,
      clients,
      weddings,
      duplicates: await this.findDuplicates(p, id),
      consents: await this.consents.list('PARTNER', id),
    };
  }

  /** Other partners with the same phone, email or website domain (a warning, never a block). */
  async findDuplicates(
    candidate: { phone?: string | null; email?: string | null; website?: string | null },
    excludeId?: string,
    m: EntityManager = this.ds.manager,
  ): Promise<DuplicateMatch[]> {
    const domain = websiteDomain(candidate.website);
    if (!candidate.phone && !candidate.email && !domain) return [];
    const rows: {
      id: string;
      firm: string;
      phone: string | null;
      email: string | null;
      website: string | null;
    }[] = await m.query(
      `SELECT id, firm, phone, email, website FROM partner
        WHERE deleted_at IS NULL AND ($1::uuid IS NULL OR id <> $1)
          AND ((phone IS NOT NULL AND phone = $2)
            OR (email IS NOT NULL AND lower(email) = lower($3))
            OR ($4::text IS NOT NULL AND website ILIKE $4))`,
      [
        excludeId ?? null,
        candidate.phone ?? null,
        candidate.email ?? null,
        domain ? `%${domain}%` : null,
      ],
    );
    return rows
      .map((r) => ({
        id: r.id,
        firm: r.firm,
        matchedOn: [
          ...(candidate.phone && r.phone === candidate.phone ? (['phone'] as const) : []),
          ...(candidate.email && r.email?.toLowerCase() === candidate.email.toLowerCase()
            ? (['email'] as const)
            : []),
          ...(domain && websiteDomain(r.website) === domain ? (['website'] as const) : []),
        ],
      }))
      .filter((d) => d.matchedOn.length > 0);
  }

  /** New partners take the default commission from Settings unless given. Possible duplicates are returned as a warning. */
  async create(
    input: PartnerInput,
    userId: string,
    m?: EntityManager,
  ): Promise<{ id: string; duplicates: DuplicateMatch[] }> {
    const run = async (tx: EntityManager) => {
      const def = await this.settings.get<CommissionDefault>('commission.default');
      const repo = tx.getRepository(Partner);
      const duplicates = await this.findDuplicates(input, undefined, tx);
      const p = repo.create({
        referralSigned: false,
        referralFileId: null,
        deletedAt: null,
        createdBy: userId,
      });
      for (const f of FIELDS) (p as unknown as Record<string, unknown>)[f] = input[f] ?? null;
      p.status = (input.status as PartnerStatus | undefined) ?? 'IMPORTED';
      p.commissionBasis = input.commissionBasis ?? def.basis;
      p.commissionBps = input.commissionBps ?? def.bps;
      const saved = await repo.save(p);
      return { id: saved.id, duplicates };
    };
    return m ? run(m) : this.ds.transaction(run);
  }

  async update(id: string, input: UpdatePartnerInput): Promise<void> {
    await this.ds.transaction(async (m) => {
      const p = await this.find(id, m);
      for (const f of FIELDS) {
        const v = input[f];
        if (v === undefined) continue;
        if (
          (f === 'firm' ||
            f === 'type' ||
            f === 'status' ||
            f === 'commissionBasis' ||
            f === 'commissionBps') &&
          v === null
        )
          continue;
        (p as unknown as Record<string, unknown>)[f] = v;
      }
      await m.getRepository(Partner).save(p);
    });
  }

  /**
   * Log what happened (called, no answer, sent deck…). Moves the pipeline forward when it should
   * and returns what Undo needs to put things back.
   */
  async addActivity(id: string, input: ActivityInput, userId: string) {
    return this.ds.transaction(async (m) => {
      const p = await this.find(id, m);
      const previous = { status: p.status, nextFollowUpOn: p.nextFollowUpOn };
      const activity = await m.getRepository(PartnerActivity).save(
        m.getRepository(PartnerActivity).create({
          partnerId: id,
          kind: input.kind,
          note: input.note ?? null,
          at: this.now(),
          createdBy: userId,
        }),
      );
      const next = statusAfterActivity(p.status, input.kind);
      let changed = false;
      if (next) {
        p.status = next;
        changed = true;
      }
      if (input.nextFollowUpOn !== undefined) {
        p.nextFollowUpOn = input.nextFollowUpOn;
        changed = true;
      }
      if (changed) await m.getRepository(Partner).save(p);
      return {
        activityId: activity.id,
        status: p.status,
        nextFollowUpOn: p.nextFollowUpOn,
        undo: previous,
      };
    });
  }

  /** Undo an activity: remove it and put status / follow-up back as they were. */
  async undoActivity(
    activityId: string,
    restore: { status?: PartnerStatus; nextFollowUpOn?: string | null },
  ): Promise<void> {
    await this.ds.transaction(async (m) => {
      const repo = m.getRepository(PartnerActivity);
      const a = await repo.findOneBy({ id: activityId });
      if (!a) throw new NotFoundException('Activity not found');
      await repo.remove(a);
      const p = await this.find(a.partnerId, m);
      if (restore.status) p.status = restore.status;
      if (restore.nextFollowUpOn !== undefined) p.nextFollowUpOn = restore.nextFollowUpOn;
      await m.getRepository(Partner).save(p);
    });
  }

  /** Upload the signed referral agreement; marks the partner as signed. */
  async setReferralAgreement(
    id: string,
    upload: { buffer: Buffer; originalName: string },
  ): Promise<void> {
    const p = await this.find(id);
    const file = await this.files.upload({ ...upload, purpose: 'signed-document' });
    const old = p.referralFileId;
    p.referralFileId = file.id;
    p.referralSigned = true;
    await this.ds.getRepository(Partner).save(p);
    if (old) await this.files.purge(old);
  }

  async removeReferralAgreement(id: string): Promise<void> {
    const p = await this.find(id);
    const old = p.referralFileId;
    p.referralFileId = null;
    p.referralSigned = false;
    await this.ds.getRepository(Partner).save(p);
    if (old) await this.files.purge(old);
  }
}
