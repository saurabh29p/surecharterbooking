import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  computeQuoteTotals,
  describeGap,
  formatDateTime,
  LIVE_QUOTE_STATUSES,
  looserGaps,
  paymentParts,
  priceLine,
  quoteReference,
  sameSchedule,
  strictestSchedule,
  type CancellationSchedule,
  type CommissionBasis,
  type CommissionDefault,
  type InvoicingModel,
  type OutwardQuote,
  type QuoteLineInput,
  type QuoteTotals,
  type ScheduleGap,
} from '@shubhjets/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { BusinessProfilesService } from '../business-profiles/business-profiles.service.js';
import { Operator } from '../operators/operator.entities.js';
import { OperatorsService } from '../operators/operators.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { Leg, Wedding } from '../weddings/wedding.entities.js';
import { Quote, QuoteLine } from './quote.entities.js';

/** Wedding statuses where the quote can still change. */
const QUOTABLE_WEDDING = ['ENQUIRY', 'RATES_REQUESTED', 'QUOTED'];
const DEFAULT_MARKUP_KEY = 'markup.default_bps';

export interface LineMarkupInput {
  legId: string;
  rateResponseId: string;
  markupType: 'PERCENT' | 'FIXED';
  /** PERCENT: basis points. FIXED: paise. */
  markupValue: number;
}

export interface ExtraInput {
  description: string;
  cost: number;
  sell: number;
}

export interface QuoteUpdateInput {
  lines?: LineMarkupInput[];
  extras?: ExtraInput[];
  cancellationSchedule?: CancellationSchedule;
  cancellationTerms?: string | null;
  validityHours?: number;
  placeOfSupplyState?: string | null;
  paymentPlanBps?: number[];
  inclusions?: string | null;
  exclusions?: string | null;
}

interface LineInfo {
  line: QuoteLine;
  operatorId: string | null;
  operatorName: string | null;
  operatorPermit: string | null;
  aircraftType: string | null;
  registration: string | null;
  seats: number | null;
  rateValidUntil: Date | null;
  rateSchedule: CancellationSchedule | null;
  rateTerms: string | null;
  operatorTerms: string | null;
  netRate: number | null;
}

interface ChoiceRow {
  leg_id: string;
  rr_id: string;
  operator_name: string;
  aircraft: string;
  cost_share: string;
  inclusions: string | null;
  exclusions: string | null;
}

const conflict = (message: string, extra: Record<string, unknown> = {}) =>
  new ConflictException({ message, ...extra });

/**
 * The quote builder (BRIEF.md §2 step 5, §5.4 wedding page, §5.5 quote):
 * a draft follows the jets chosen on the Rates tab, gets our markup per jet, extras, GST from
 * Settings, our cancellation charges (compared with each operator's) and validity. Issuing freezes
 * it. All maths is the shared code; internal figures never go into the client-safe snapshot.
 */
@Injectable()
export class QuotesService {
  now: () => Date = () => new Date();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly settings: SettingsService,
    private readonly operators: OperatorsService,
    private readonly profiles: BusinessProfilesService,
  ) {}

  // ---------- Finding ----------

  private async wedding(m: EntityManager, id: string): Promise<Wedding> {
    const w = await m.getRepository(Wedding).findOneBy({ id });
    if (!w || w.deletedAt) throw new NotFoundException('Wedding not found');
    return w;
  }

  async find(id: string, m: EntityManager = this.ds.manager): Promise<Quote> {
    const q = await m.getRepository(Quote).findOneBy({ id });
    if (!q) throw new NotFoundException('Quote not found');
    return q;
  }

  private assertDraft(q: Quote) {
    if (q.status !== 'DRAFT')
      throw conflict('This quote is issued and can no longer change. Make a new version instead.');
  }

  /** Issued or sent quotes past their validity become Expired. */
  private async expireStale(m: EntityManager, weddingId: string): Promise<void> {
    const repo = m.getRepository(Quote);
    const live = await repo.find({ where: { weddingId } });
    for (const q of live) {
      if (LIVE_QUOTE_STATUSES.includes(q.status) && q.validUntil && q.validUntil < this.now()) {
        q.status = 'EXPIRED';
        await repo.save(q);
      }
    }
  }

  async list(weddingId: string) {
    await this.wedding(this.ds.manager, weddingId);
    await this.expireStale(this.ds.manager, weddingId);
    const rows = await this.ds
      .getRepository(Quote)
      .find({ where: { weddingId }, order: { version: 'DESC' } });
    const w = await this.wedding(this.ds.manager, weddingId);
    return rows.map((q) => ({
      id: q.id,
      version: q.version,
      reference: quoteReference(w.code, q.version),
      status: q.status,
      total: 'total' in q.totals ? q.totals.total : 0,
      validUntil: q.validUntil,
      issuedAt: q.issuedAt,
      sharedAt: q.sharedAt,
      acceptedAt: q.acceptedAt,
      acceptedName: q.acceptedName,
    }));
  }

  // ---------- Starting a draft ----------

  /**
   * Opens the wedding's draft: the existing one, or a new version that copies the last issued
   * quote's markups, extras and terms (or starts from Settings).
   */
  async start(weddingId: string, userId: string) {
    const id = await this.ds.transaction(async (m) => {
      const w = await this.wedding(m, weddingId);
      if (!QUOTABLE_WEDDING.includes(w.status))
        throw conflict(
          w.status === 'LOST'
            ? 'This wedding is marked lost. Reopen it first.'
            : 'This wedding is confirmed; its quote can no longer change.',
        );
      const repo = m.getRepository(Quote);
      const existing = await repo.findOneBy({ weddingId, status: 'DRAFT' });
      if (existing) return existing.id;

      const [chosen] = await m.query(
        `SELECT count(*)::int AS n FROM leg_choice lc JOIN leg l ON l.id = lc.leg_id WHERE l.wedding_id = $1`,
        [weddingId],
      );
      if (!chosen.n) throw conflict('Choose the jet for each leg on the Rates tab first.');

      const profileId = w.businessProfileId ?? (await this.profiles.getDefault())?.id;
      if (!profileId) throw conflict('Add your business profile in Settings first.');

      const [{ v }] = await m.query(
        `SELECT coalesce(max(version), 0)::int AS v FROM quote WHERE wedding_id = $1`,
        [weddingId],
      );
      const previous = v
        ? await repo.findOne({ where: { weddingId }, order: { version: 'DESC' } })
        : null;
      const q = repo.create({
        weddingId,
        version: v + 1,
        businessProfileId: profileId,
        status: 'DRAFT',
        validUntil: null,
        validityHours:
          previous?.validityHours ?? (await this.settings.get<number>('quote.validity_hours')),
        gstRateBps: 0,
        gstSac: null,
        invoicingModel: 'FULL_VALUE',
        placeOfSupplyState: previous
          ? previous.placeOfSupplyState
          : (w.placeOfSupplyState ?? (await this.clientState(m, w.clientId))),
        cancellationTerms:
          previous?.cancellationTerms ??
          ((await this.settings.get<string>('quote.cancellation_terms')) || null),
        cancellationSchedule:
          previous?.cancellationSchedule ??
          (await this.settings.get<CancellationSchedule>('quote.cancellation_schedule')),
        paymentPlanBps: previous?.paymentPlanBps ?? w.paymentPlanBps,
        commissionBasis: null,
        commissionBps: null,
        inclusions: previous?.inclusions ?? null,
        exclusions: previous?.exclusions ?? null,
        totals: {},
        snapshot: null,
        createdBy: userId,
      });
      await repo.save(q);
      if (previous) {
        // Keep the markups and extras of the last version.
        const lines = await m
          .getRepository(QuoteLine)
          .find({ where: { quoteId: previous.id }, order: { seq: 'ASC' } });
        await m.getRepository(QuoteLine).insert(
          lines.map((l) => ({
            quoteId: q.id,
            seq: l.seq,
            legId: l.legId,
            rateResponseId: l.rateResponseId,
            description: l.description,
            cost: l.cost,
            markupType: l.markupType,
            markupValue: l.markupValue,
            sell: l.sell,
          })),
        );
      }
      await this.sync(m, q, !previous);
      return q.id;
    });
    return this.get(id);
  }

  /** A client's GST state comes from their GSTIN (first two digits). */
  private async clientState(m: EntityManager, clientId: string | null): Promise<string | null> {
    if (!clientId) return null;
    const [c] = await m.query(`SELECT gstin FROM client WHERE id = $1`, [clientId]);
    return c?.gstin ? String(c.gstin).slice(0, 2) : null;
  }

  // ---------- Keeping a draft in step with the chosen jets ----------

  /**
   * Rebuilds a draft's jet lines from the current choices (keeping each jet's markup), refreshes
   * GST and commission from Settings and the partner, and recomputes the totals.
   */
  private async sync(m: EntityManager, q: Quote, fillInclusions = false): Promise<void> {
    if (q.status !== 'DRAFT') return;
    const w = await this.wedding(m, q.weddingId);
    const choices: ChoiceRow[] = await m.query(
      `SELECT l.id AS leg_id, rr.id AS rr_id, coalesce(o.brand, o.legal_name) AS operator_name,
              coalesce(nullif(concat_ws(' ', a.type, a.registration), ''), rr.aircraft_text, 'Aircraft to be confirmed') AS aircraft,
              rrl.cost_share, rr.inclusions, rr.exclusions
         FROM leg_choice lc
         JOIN leg l ON l.id = lc.leg_id
         JOIN rate_response rr ON rr.id = lc.rate_response_id
         JOIN rate_response_leg rrl ON rrl.rate_response_id = rr.id AND rrl.leg_id = l.id
         JOIN operator o ON o.id = rr.operator_id
         LEFT JOIN aircraft a ON a.id = rr.aircraft_id
        WHERE l.wedding_id = $1 AND l.status <> 'CANCELLED'
        ORDER BY l.seq, rrl.cost_share DESC, rr.id`,
      [q.weddingId],
    );
    const lineRepo = m.getRepository(QuoteLine);
    const current = await lineRepo.find({ where: { quoteId: q.id }, order: { seq: 'ASC' } });
    const markups = new Map(
      current
        .filter((l) => l.legId && l.rateResponseId)
        .map((l) => [`${l.legId}:${l.rateResponseId}`, l]),
    );
    const defaultBps = await this.settings.get<number>(DEFAULT_MARKUP_KEY);

    const desired: Omit<QuoteLine, 'id' | 'quoteId'>[] = [];
    for (const c of choices) {
      const old = markups.get(`${c.leg_id}:${c.rr_id}`);
      const cost = Number(c.cost_share);
      const markupType = old?.markupType ?? 'PERCENT';
      const markupValue = old?.markupValue ?? defaultBps;
      desired.push({
        seq: desired.length + 1,
        legId: c.leg_id,
        rateResponseId: c.rr_id,
        description: `${c.aircraft} · ${c.operator_name}`,
        cost,
        markupType,
        markupValue,
        sell: priceLine(lineInput(cost, markupType, markupValue)).sell,
      });
    }
    for (const e of current.filter((l) => !l.legId)) {
      desired.push({
        seq: desired.length + 1,
        legId: null,
        rateResponseId: null,
        description: e.description,
        cost: e.cost,
        markupType: null,
        markupValue: null,
        sell: e.sell,
      });
    }
    const key = (l: Omit<QuoteLine, 'id' | 'quoteId'>) =>
      [
        l.seq,
        l.legId,
        l.rateResponseId,
        l.description,
        l.cost,
        l.markupType,
        l.markupValue,
        l.sell,
      ].join('|');
    if (current.map(key).join('\n') !== desired.map(key).join('\n')) {
      await lineRepo.delete({ quoteId: q.id });
      if (desired.length) await lineRepo.insert(desired.map((l) => ({ ...l, quoteId: q.id })));
    }

    // GST, invoicing model and commission follow Settings and the partner until issued.
    q.gstRateBps = await this.settings.get<number>('gst.rate_bps');
    q.gstSac = (await this.settings.get<string>('gst.sac')) || null;
    q.invoicingModel = await this.settings.get<InvoicingModel>('invoicing.model');
    const commission = await this.commissionFor(m, w.partnerId);
    q.commissionBasis = commission?.basis ?? null;
    q.commissionBps = commission?.bps ?? null;
    if (fillInclusions && q.inclusions === null && q.exclusions === null) {
      const join = (xs: (string | null)[]) =>
        [...new Set(xs.map((x) => x?.trim()).filter((x): x is string => !!x))].join('\n') || null;
      q.inclusions = join(choices.map((c) => c.inclusions));
      q.exclusions = join(choices.map((c) => c.exclusions));
    }
    q.totals = await this.computeTotals(m, q);
    await m.getRepository(Quote).save(q);
  }

  private async commissionFor(
    m: EntityManager,
    partnerId: string | null,
  ): Promise<CommissionDefault | null> {
    if (!partnerId) return null;
    const [p] = await m.query(
      `SELECT commission_basis, commission_bps FROM partner WHERE id = $1`,
      [partnerId],
    );
    return p ? { basis: p.commission_basis as CommissionBasis, bps: p.commission_bps } : null;
  }

  private async computeTotals(m: EntityManager, q: Quote): Promise<QuoteTotals> {
    const lines = await m
      .getRepository(QuoteLine)
      .find({ where: { quoteId: q.id }, order: { seq: 'ASC' } });
    const [profile] = await m.query(`SELECT state_code FROM business_profile WHERE id = $1`, [
      q.businessProfileId,
    ]);
    return computeQuoteTotals({
      lines: lines.map((l) =>
        l.legId && l.markupType && l.markupValue !== null
          ? lineInput(l.cost, l.markupType, l.markupValue)
          : { cost: l.cost, sell: l.sell },
      ),
      gst: {
        rateBps: q.gstRateBps,
        model: q.invoicingModel,
        supplierState: profile?.state_code ?? null,
        placeOfSupplyState: q.placeOfSupplyState,
      },
      commission:
        q.commissionBasis && q.commissionBps !== null
          ? { basis: q.commissionBasis, bps: q.commissionBps }
          : null,
    });
  }

  // ---------- Reading ----------

  /** Everything the quote screen shows (internal: includes cost, margin and commission). */
  async get(id: string) {
    const q = await this.ds.transaction(async (m) => {
      const q = await this.find(id, m);
      await this.expireStale(m, q.weddingId);
      const fresh = await this.find(id, m);
      await this.sync(m, fresh);
      return fresh;
    });
    return this.detail(this.ds.manager, q);
  }

  private async lineInfo(m: EntityManager, quoteId: string): Promise<LineInfo[]> {
    const lines = await m
      .getRepository(QuoteLine)
      .find({ where: { quoteId }, order: { seq: 'ASC' } });
    const ids = lines.map((l) => l.rateResponseId).filter((x): x is string => !!x);
    const rows: Record<string, unknown>[] = ids.length
      ? await m.query(
          `SELECT rr.id, rr.operator_id, coalesce(o.brand, o.legal_name) AS operator_name, o.nsop_no,
                  a.type, a.registration, rr.aircraft_text, rr.seats, rr.valid_until, rr.net_rate,
                  rr.cancellation_schedule, rr.cancellation_terms, o.cancellation_terms AS op_terms
             FROM rate_response rr JOIN operator o ON o.id = rr.operator_id
             LEFT JOIN aircraft a ON a.id = rr.aircraft_id WHERE rr.id = ANY($1)`,
          [ids],
        )
      : [];
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    return lines.map((line) => {
      const r = line.rateResponseId ? byId.get(line.rateResponseId) : undefined;
      return {
        line,
        operatorId: (r?.operator_id as string) ?? null,
        operatorName: (r?.operator_name as string) ?? null,
        operatorPermit: (r?.nsop_no as string) ?? null,
        aircraftType: ((r?.type as string) || (r?.aircraft_text as string)) ?? null,
        registration: (r?.registration as string) ?? null,
        seats: (r?.seats as number) ?? null,
        rateValidUntil: r?.valid_until ? new Date(r.valid_until as string) : null,
        rateSchedule: (r?.cancellation_schedule as CancellationSchedule) ?? null,
        rateTerms: (r?.cancellation_terms as string) ?? null,
        operatorTerms: (r?.op_terms as string) ?? null,
        netRate: r?.net_rate !== undefined ? Number(r.net_rate) : null,
      };
    });
  }

  async detail(m: EntityManager, q: Quote) {
    const w = await this.wedding(m, q.weddingId);
    const legs = (
      await m.getRepository(Leg).find({ where: { weddingId: q.weddingId }, order: { seq: 'ASC' } })
    ).filter((l) => l.status !== 'CANCELLED');
    const infos = await this.lineInfo(m, q.id);
    const totals = 'total' in q.totals ? q.totals : await this.computeTotals(m, q);
    const now = this.now();
    const profile = await this.profiles.get(q.businessProfileId);
    const isDraft = q.status === 'DRAFT';

    // Can each operator be quoted (rule 1)? Checked live for drafts.
    const quotable = new Map<string, { ok: boolean; reason: string | null }>();
    for (const opId of new Set(infos.map((i) => i.operatorId).filter((x): x is string => !!x))) {
      try {
        await this.operators.assertQuotable(opId, m);
        quotable.set(opId, { ok: true, reason: null });
      } catch (err) {
        const body = (err as ConflictException).getResponse() as { reason?: string };
        quotable.set(opId, { ok: false, reason: body.reason ?? 'Not quotable' });
      }
    }

    const legViews = legs.map((leg) => {
      const lines = infos
        .map((info, i) => ({ info, priced: totals.lines[i]! }))
        .filter(({ info }) => info.line.legId === leg.id)
        .map(({ info, priced }) => ({
          id: info.line.id,
          rateResponseId: info.line.rateResponseId!,
          operator: { id: info.operatorId!, name: info.operatorName! },
          aircraft: [info.aircraftType, info.registration].filter(Boolean).join(' '),
          seats: info.seats,
          cost: priced.cost,
          markupType: info.line.markupType!,
          markupValue: info.line.markupValue!,
          sell: priced.sell,
          margin: priced.margin,
          rateValidUntil: info.rateValidUntil,
          rateExpired: !!info.rateValidUntil && info.rateValidUntil < now,
          quotable: quotable.get(info.operatorId!) ?? { ok: false, reason: 'Unknown operator' },
        }));
      return {
        legId: leg.id,
        seq: leg.seq,
        from: leg.fromIata,
        to: leg.toIata,
        date: leg.flightDate,
        windowFrom: leg.windowFrom,
        windowTo: leg.windowTo,
        pax: leg.pax,
        seats: lines.reduce((s, l) => s + (l.seats ?? 0), 0),
        cost: lines.reduce((s, l) => s + l.cost, 0),
        sell: lines.reduce((s, l) => s + l.sell, 0),
        lines,
      };
    });
    const extras = infos
      .map((info, i) => ({ info, priced: totals.lines[i]! }))
      .filter(({ info }) => !info.line.legId)
      .map(({ info, priced }) => ({
        id: info.line.id,
        description: info.line.description,
        cost: priced.cost,
        sell: priced.sell,
        margin: priced.margin,
      }));

    // Cancellation: ours next to each operator's, and where ours are looser.
    const ours = q.cancellationSchedule ?? [];
    const byResponse = new Map<string, LineInfo>();
    for (const info of infos)
      if (info.line.rateResponseId) byResponse.set(info.line.rateResponseId, info);
    const operatorTerms = [...byResponse.values()].map((info) => {
      const gaps: ScheduleGap[] = info.rateSchedule ? looserGaps(ours, info.rateSchedule) : [];
      return {
        rateResponseId: info.line.rateResponseId!,
        operator: { id: info.operatorId!, name: info.operatorName! },
        aircraft: info.aircraftType,
        schedule: info.rateSchedule,
        terms: info.rateTerms ?? info.operatorTerms,
        gaps,
        gapText: gaps.map((g) => describeGap(g, info.operatorName!)),
      };
    });
    const known = operatorTerms
      .map((o) => o.schedule)
      .filter((s): s is CancellationSchedule => !!s);
    const fix = known.length && ours.length ? strictestSchedule([ours, ...known]) : null;

    // Validity: from now for a draft (it starts when issued).
    const validUntil = isDraft
      ? new Date(now.getTime() + q.validityHours * 3_600_000)
      : q.validUntil;

    const blockers: string[] = [];
    const warnings: string[] = [];
    if (isDraft) {
      for (const leg of legViews) {
        const route = `leg ${leg.seq} (${leg.from} → ${leg.to})`;
        if (!leg.lines.length) blockers.push(`Choose a jet for ${route} on the Rates tab`);
        else if (leg.seats < leg.pax)
          blockers.push(`The jets for ${route} seat ${leg.seats}; it has ${leg.pax} guests`);
      }
      for (const [opId, r] of quotable) {
        if (!r.ok) {
          const name = infos.find((i) => i.operatorId === opId)!.operatorName;
          blockers.push(`${name} can't be quoted: ${r.reason}`);
        }
      }
      for (const info of byResponse.values()) {
        if (info.rateValidUntil && info.rateValidUntil < now)
          blockers.push(
            `${info.operatorName}'s rate expired on ${formatDateTime(info.rateValidUntil)}: ask them to confirm it`,
          );
        else if (info.rateValidUntil && validUntil && info.rateValidUntil < validUntil)
          warnings.push(
            `${info.operatorName}'s rate is only valid until ${formatDateTime(info.rateValidUntil)}, before this quote would expire.`,
          );
      }
      if (!ours.length) blockers.push('Add your cancellation charges');
      for (const o of operatorTerms)
        if (!o.schedule)
          warnings.push(
            `${o.operator.name}'s cancellation charges aren't recorded, so they can't be compared with yours.`,
          );
      for (const leg of legViews)
        for (const l of leg.lines)
          if (l.margin <= 0)
            warnings.push(
              `Leg ${leg.seq} (${l.operator.name}): no margin. The client price equals the operator's rate.`,
            );
      const gst = await this.settings.view();
      if (gst.settings.some((s) => s.key.startsWith('gst.') && !s.confirmed))
        warnings.push('GST rate and SAC code are not yet confirmed by your CA.');
      for (const text of profile.readiness.warnings)
        warnings.push(`Business profile: ${text}. The quote will go out without it.`);
      if (q.invoicingModel === 'FEE_ONLY')
        warnings.push(
          'Invoicing is fee-only: the GST amount on the quote lets a careful reader work out your margin.',
        );
      if (!q.placeOfSupplyState)
        warnings.push(
          "Client's state not known: GST is worked out as within your state (CGST + SGST).",
        );
    }

    return {
      id: q.id,
      weddingId: q.weddingId,
      weddingCode: w.code,
      version: q.version,
      reference: quoteReference(w.code, q.version),
      status: q.status,
      validityHours: q.validityHours,
      validUntil,
      issuedAt: q.issuedAt,
      sharedAt: q.sharedAt,
      acceptedAt: q.acceptedAt,
      acceptedName: q.acceptedName,
      businessProfile: { id: profile.id, label: profile.label },
      legs: legViews,
      extras,
      cancellation: {
        ours,
        note: q.cancellationTerms,
        operators: operatorTerms,
        looser: operatorTerms.some((o) => o.gaps.length > 0),
        fix: fix && !sameSchedule(fix, ours) ? fix : null,
      },
      gst: {
        rateBps: q.gstRateBps,
        sac: q.gstSac,
        model: q.invoicingModel,
        placeOfSupplyState: q.placeOfSupplyState,
      },
      paymentPlanBps: q.paymentPlanBps,
      payment: paymentParts(totals.total, q.paymentPlanBps),
      inclusions: q.inclusions,
      exclusions: q.exclusions,
      totals,
      commission:
        q.commissionBasis && q.commissionBps !== null
          ? { basis: q.commissionBasis, bps: q.commissionBps }
          : null,
      blockers,
      warnings,
    };
  }

  // ---------- Editing a draft ----------

  async update(id: string, input: QuoteUpdateInput) {
    await this.ds.transaction(async (m) => {
      const q = await this.find(id, m);
      this.assertDraft(q);
      const lineRepo = m.getRepository(QuoteLine);
      if (input.lines) {
        const lines = await lineRepo.find({ where: { quoteId: id } });
        for (const change of input.lines) {
          const line = lines.find(
            (l) => l.legId === change.legId && l.rateResponseId === change.rateResponseId,
          );
          if (!line) throw conflict('The chosen jets changed. Refresh and try again.');
          line.markupType = change.markupType;
          line.markupValue = change.markupValue;
          line.sell = priceLine(lineInput(line.cost, change.markupType, change.markupValue)).sell;
          await lineRepo.save(line);
        }
      }
      if (input.extras) {
        await m.query(`DELETE FROM quote_line WHERE quote_id = $1 AND leg_id IS NULL`, [id]);
        const [{ n }] = await m.query(
          `SELECT count(*)::int AS n FROM quote_line WHERE quote_id = $1`,
          [id],
        );
        if (input.extras.length)
          await lineRepo.insert(
            input.extras.map((e, i) => ({
              quoteId: id,
              seq: n + i + 1,
              legId: null,
              rateResponseId: null,
              description: e.description,
              cost: e.cost,
              markupType: null,
              markupValue: null,
              sell: e.sell,
            })),
          );
      }
      for (const k of [
        'cancellationSchedule',
        'cancellationTerms',
        'validityHours',
        'placeOfSupplyState',
        'paymentPlanBps',
        'inclusions',
        'exclusions',
      ] as const) {
        if (input[k] !== undefined) (q as unknown as Record<string, unknown>)[k] = input[k];
      }
      await m.getRepository(Quote).save(q);
      await this.sync(m, q);
    });
    return this.get(id);
  }

  /** Records an operator's cancellation charges from the quote screen (optionally as their usual terms). */
  async setOperatorSchedule(
    rateResponseId: string,
    schedule: CancellationSchedule | null,
    saveForOperator: boolean,
  ): Promise<void> {
    await this.ds.transaction(async (m) => {
      const [r] = await m.query(`SELECT operator_id FROM rate_response WHERE id = $1`, [
        rateResponseId,
      ]);
      if (!r) throw new NotFoundException('Rate not found');
      await m.query(
        `UPDATE rate_response SET cancellation_schedule = $2::jsonb, updated_at = now() WHERE id = $1`,
        [rateResponseId, schedule === null ? null : JSON.stringify(schedule)],
      );
      if (saveForOperator && schedule) {
        const op = await this.operators.find(r.operator_id, m);
        op.cancellationSchedule = schedule;
        await m.getRepository(Operator).save(op);
      }
    });
  }

  async remove(id: string): Promise<void> {
    await this.ds.transaction(async (m) => {
      const q = await this.find(id, m);
      this.assertDraft(q);
      await m.getRepository(Quote).remove(q);
    });
  }

  // ---------- Issuing, sending, accepting ----------

  /** Checks a draft can be issued; throws a plain-language conflict when it can't. */
  async assertIssuable(m: EntityManager, q: Quote, confirmLooser: boolean) {
    this.assertDraft(q);
    await this.sync(m, q);
    const d = await this.detail(m, q);
    if (d.blockers.length)
      throw conflict(d.blockers[0]!, { code: 'QUOTE_BLOCKED', blockers: d.blockers });
    for (const opId of new Set(d.legs.flatMap((l) => l.lines.map((x) => x.operator.id))))
      await this.operators.assertQuotable(opId, m); // rule 1, again at the moment of issue
    if (d.cancellation.looser && !confirmLooser)
      throw conflict('Your cancellation terms are looser than the operator’s.', {
        code: 'LOOSER_TERMS',
        gaps: d.cancellation.operators.flatMap((o) => o.gapText),
      });
    return d;
  }

  /**
   * Issues a draft: freezes the client-safe snapshot, starts the validity clock, replaces older
   * live versions, and marks the legs and wedding as quoted. (The PDF is made by QuoteDocuments.)
   */
  async issue(
    m: EntityManager,
    id: string,
    confirmLooser: boolean,
  ): Promise<{ quote: Quote; outward: OutwardQuote }> {
    const q = await this.find(id, m);
    await m.query(`SELECT 1 FROM quote WHERE id = $1 FOR UPDATE`, [id]);
    await this.assertIssuable(m, q, confirmLooser);
    const now = this.now();
    q.status = 'ISSUED';
    q.issuedAt = now;
    q.validUntil = new Date(now.getTime() + q.validityHours * 3_600_000);
    const outward = await this.outward(m, q);
    q.snapshot = outward;
    await m.getRepository(Quote).save(q);

    const repo = m.getRepository(Quote);
    for (const old of await repo.find({ where: { weddingId: q.weddingId } })) {
      if (old.id !== q.id && ['ISSUED', 'SHARED', 'ACCEPTED'].includes(old.status)) {
        old.status = 'SUPERSEDED';
        await repo.save(old);
      }
    }
    const legRepo = m.getRepository(Leg);
    for (const leg of await legRepo.find({ where: { weddingId: q.weddingId } })) {
      if (leg.status !== 'CANCELLED' && leg.status !== 'QUOTED') {
        leg.status = 'QUOTED';
        await legRepo.save(leg);
      }
    }
    const w = await this.wedding(m, q.weddingId);
    if (w.status === 'ENQUIRY' || w.status === 'RATES_REQUESTED') {
      w.status = 'QUOTED';
      await m.getRepository(Wedding).save(w);
    }
    return { quote: q, outward };
  }

  private assertLive(q: Quote, action: string) {
    if (q.status === 'DRAFT') throw conflict(`Issue the quote before you ${action} it.`);
    if (q.status === 'EXPIRED' || (q.validUntil && q.validUntil < this.now()))
      throw conflict('This quote has expired. Make a new version with fresh rates.');
    if (!LIVE_QUOTE_STATUSES.includes(q.status) && q.status !== 'ACCEPTED')
      throw conflict(
        `This quote was ${q.status === 'SUPERSEDED' ? 'replaced' : q.status.toLowerCase()}.`,
      );
  }

  /** You sent the quote yourself (WhatsApp, email…). Records the first time; later shares are logged too. */
  async markSent(m: EntityManager, id: string): Promise<Quote> {
    const q = await this.find(id, m);
    this.assertLive(q, 'send');
    if (q.status === 'ISSUED') q.status = 'SHARED';
    q.sharedAt ??= this.now();
    return m.getRepository(Quote).save(q);
  }

  /** The client or planner said yes. Confirming the wedding still needs signed terms and payment (rule 2). */
  async accept(id: string, name: string) {
    await this.ds.transaction(async (m) => {
      const q = await this.find(id, m);
      this.assertLive(q, 'accept');
      if (q.status === 'ACCEPTED') throw conflict('This quote is already accepted.');
      q.status = 'ACCEPTED';
      q.acceptedAt = this.now();
      q.acceptedName = name;
      q.sharedAt ??= q.acceptedAt;
      await m.getRepository(Quote).save(q);
    });
    return this.get(id);
  }

  // ---------- Client-safe content ----------

  /**
   * The client-safe quote: only what a partner or client may see (hard rule 4). Built from an
   * explicit list of fields; there is no cost, net rate, margin, markup or commission here.
   */
  async outward(m: EntityManager, q: Quote): Promise<OutwardQuote> {
    const w = await this.wedding(m, q.weddingId);
    const totals = 'total' in q.totals ? q.totals : await this.computeTotals(m, q);
    const infos = await this.lineInfo(m, q.id);
    const legs = await m
      .getRepository(Leg)
      .find({ where: { weddingId: q.weddingId }, order: { seq: 'ASC' } });
    const iatas = [...new Set(legs.flatMap((l) => [l.fromIata, l.toIata]))];
    const airports: { iata: string; city: string; name: string }[] = await m.query(
      `SELECT iata, city, name FROM airport WHERE iata = ANY($1)`,
      [iatas],
    );
    const airport = (iata: string) => {
      const a = airports.find((x) => x.iata === iata);
      return { iata, city: a?.city ?? iata, name: a?.name ?? iata };
    };
    const profile = await this.profiles.get(q.businessProfileId);
    const [client] = w.clientId
      ? await m.query(`SELECT name FROM client WHERE id = $1`, [w.clientId])
      : [];
    const priced = infos.map((info, i) => ({ info, price: totals.lines[i]!.sell }));
    return {
      reference: quoteReference(w.code, q.version),
      version: q.version,
      issuedAt: (q.issuedAt ?? this.now()).toISOString(),
      validUntil: (
        q.validUntil ?? new Date(this.now().getTime() + q.validityHours * 3_600_000)
      ).toISOString(),
      preview: q.status === 'DRAFT',
      business: {
        brandName: profile.brandName ?? 'ShubhJets',
        legalName: profile.legalName,
        llpin: profile.llpin,
        gstin: profile.gstin,
        address: profile.registeredAddress,
        signatoryName: profile.signatoryName,
        signatoryDesignation: profile.signatoryDesignation,
        logo: null,
      },
      bank: null,
      client: { name: (client?.name as string) ?? null },
      wedding: { code: w.code, city: w.venueCity, startsOn: w.startsOn, endsOn: w.endsOn },
      legs: legs
        .filter((l) => priced.some((p) => p.info.line.legId === l.id))
        .map((l) => {
          const lines = priced
            .filter((p) => p.info.line.legId === l.id)
            .map(({ info, price }) => ({
              aircraft: info.aircraftType ?? 'Aircraft to be confirmed',
              seats: info.seats,
              operator: info.operatorName ?? '',
              operatorPermit: info.operatorPermit,
              price,
            }));
          return {
            seq: l.seq,
            from: airport(l.fromIata),
            to: airport(l.toIata),
            date: l.flightDate,
            windowFrom: l.windowFrom,
            windowTo: l.windowTo,
            pax: l.pax,
            lines,
            price: lines.reduce((s, x) => s + x.price, 0),
          };
        }),
      extras: priced
        .filter((p) => !p.info.line.legId)
        .map((p) => ({ description: p.info.line.description, price: p.price })),
      subtotal: totals.sellSubtotal,
      gst: {
        rateBps: totals.gst.rateBps,
        sac: q.gstSac,
        intraState: totals.gst.intraState,
        cgst: totals.gst.cgst,
        sgst: totals.gst.sgst,
        igst: totals.gst.igst,
        total: totals.gst.total,
        feeOnly: q.invoicingModel === 'FEE_ONLY',
      },
      total: totals.total,
      payment: paymentParts(totals.total, q.paymentPlanBps),
      cancellation: { schedule: q.cancellationSchedule ?? [], note: q.cancellationTerms },
      inclusions: q.inclusions,
      exclusions: q.exclusions,
    };
  }

  /**
   * Every internal figure behind a quote, for the leak scan of anything built from it:
   * operator net rates and cost shares, margins, markups and commission (rule 4).
   */
  async internalFigures(m: EntityManager, q: Quote) {
    const infos = await this.lineInfo(m, q.id);
    const totals = 'total' in q.totals ? q.totals : await this.computeTotals(m, q);
    const amounts: { label: string; paise: number }[] = [];
    const percents: { label: string; bps: number }[] = [];
    infos.forEach((info, i) => {
      const who = info.operatorName ?? info.line.description;
      const priced = totals.lines[i]!;
      amounts.push({ label: `${who} cost`, paise: priced.cost });
      if (info.netRate !== null) amounts.push({ label: `${who} net rate`, paise: info.netRate });
      amounts.push({ label: `Margin on ${who}`, paise: priced.margin });
      if (info.line.markupType === 'PERCENT' && info.line.markupValue)
        percents.push({ label: `Markup on ${who}`, bps: info.line.markupValue });
    });
    amounts.push(
      { label: 'Total operator cost', paise: totals.cost },
      { label: 'Total margin', paise: totals.margin },
      { label: 'Partner commission', paise: totals.commission },
      { label: 'Margin after commission', paise: totals.netMargin },
    );
    percents.push({ label: 'Margin %', bps: totals.marginBps });
    const operatorIds = [
      ...new Set(infos.map((i) => i.operatorId).filter((x): x is string => !!x)),
    ];
    return { amounts, percents, operatorIds };
  }
}

function lineInput(cost: number, type: 'PERCENT' | 'FIXED', value: number): QuoteLineInput {
  return type === 'PERCENT'
    ? { cost, markupType: 'PERCENT', markupBps: value }
    : { cost, markupType: 'FIXED', markupAmount: value };
}
