import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  formatDateTime,
  isHelicopter,
  rankOperatorsForLeg,
  rateRequestMessage,
  splitPackage,
  type CancellationSchedule,
  type AircraftCategory,
  type HeliService,
  type HourlyPricing,
  type LegSite,
  type RankOperator,
} from '@shubhjets/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { OperatorsService } from '../operators/operators.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  Leg,
  LegChoice,
  RateRequest,
  RateRequestLeg,
  RateResponse,
  RateResponseLeg,
} from './wedding.entities.js';
import { WeddingsService } from './weddings.service.js';

const fieldErrors = (fields: Record<string, string>) =>
  new BadRequestException({ message: 'Please fix the highlighted fields', fields });
const hours = (from: Date, to: Date) =>
  Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 10) / 10;

export interface ResponseInput {
  operatorId: string;
  rateRequestId?: string | null;
  aircraftId?: string | null;
  aircraftText?: string | null;
  seats?: number | null;
  netRate: number;
  /** Helicopter replies priced per flying hour (netRate is their total). */
  pricing?: HourlyPricing | null;
  legIds: string[];
  costShares?: number[] | null;
  inclusions?: string | null;
  exclusions?: string | null;
  cancellationTerms?: string | null;
  cancellationSchedule?: CancellationSchedule | null;
  validUntil?: Date | null;
  receivedAt?: Date | null;
  rawText?: string | null;
}

/**
 * Rates for a wedding (BRIEF.md §2 steps 3–5): who to ask, asking, recording replies,
 * comparing them side by side per leg, and choosing the jet(s) for each leg.
 * Net rates stay internal: nothing here is ever shared with partners or clients.
 */
@Injectable()
export class RatesService {
  now: () => Date = () => new Date();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly weddings: WeddingsService,
    private readonly operators: OperatorsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  private async operatorSchedule(
    m: EntityManager,
    operatorId: string,
  ): Promise<CancellationSchedule | null> {
    const [o] = await m.query(`SELECT cancellation_schedule FROM operator WHERE id = $1`, [
      operatorId,
    ]);
    return (o?.cancellation_schedule as CancellationSchedule | null) ?? null;
  }

  private async legsOf(m: EntityManager, weddingId: string): Promise<Leg[]> {
    return m.getRepository(Leg).find({ where: { weddingId }, order: { seq: 'ASC' } });
  }

  // ---------- Suggestions ----------

  /** Verified operators ranked for one leg, with plain reasons (no AI). */
  async suggestions(legId: string) {
    const leg = await this.ds.getRepository(Leg).findOneBy({ id: legId });
    if (!leg) throw new NotFoundException('Leg not found');
    const ops: { id: string; name: string; bases: string[]; dgca_rank: number | null }[] =
      await this.ds.query(
        `SELECT o.id, coalesce(o.brand, o.legal_name) AS name, o.dgca_rank,
              coalesce((SELECT array_agg(b.airport_iata::text) FROM operator_base b WHERE b.operator_id = o.id), '{}') AS bases
         FROM operator o WHERE o.deleted_at IS NULL AND o.status IN ('VERIFIED', 'EXPIRING_SOON')`,
      );
    if (!ops.length) return [];
    const ids = ops.map((o) => o.id);
    const aircraft: {
      operator_id: string;
      category: AircraftCategory;
      seats: number;
      base_airport: string | null;
    }[] = await this.ds.query(
      `SELECT operator_id, category, seats, base_airport FROM aircraft WHERE deleted_at IS NULL AND operator_id = ANY($1)`,
      [ids],
    );
    const reply: { operator_id: string; h: number }[] = await this.ds.query(
      `SELECT r.operator_id, round((avg(extract(epoch FROM r.received_at - rq.sent_at)) / 3600)::numeric, 1)::float AS h
         FROM rate_response r JOIN rate_request rq ON rq.id = r.rate_request_id WHERE r.operator_id = ANY($1) GROUP BY r.operator_id`,
      [ids],
    );
    // Price history: their cost share vs the average of all replies on the same leg (legs with 2+ replies).
    const price: { operator_id: string; idx: number }[] = await this.ds.query(
      `WITH per_leg AS (
         SELECT rrl.leg_id, r.operator_id, rrl.cost_share::float AS cost, avg(rrl.cost_share::float) OVER (PARTITION BY rrl.leg_id) AS leg_avg,
                count(*) OVER (PARTITION BY rrl.leg_id) AS n
           FROM rate_response_leg rrl JOIN rate_response r ON r.id = rrl.rate_response_id)
       SELECT operator_id, round(avg(cost / leg_avg)::numeric, 2)::float AS idx FROM per_leg
        WHERE n > 1 AND leg_avg > 0 AND operator_id = ANY($1) GROUP BY operator_id`,
      [ids],
    );
    const requested: { operator_id: string }[] = await this.ds.query(
      `SELECT DISTINCT rq.operator_id FROM rate_request rq JOIN rate_request_leg rl ON rl.rate_request_id = rq.id WHERE rl.leg_id = $1`,
      [legId],
    );
    const input: RankOperator[] = ops.map((o) => ({
      id: o.id,
      name: o.name,
      bases: o.bases,
      aircraft: aircraft
        .filter((a) => a.operator_id === o.id)
        .map((a) => ({ category: a.category, seats: a.seats, baseAirport: a.base_airport })),
      avgReplyHours: reply.find((r) => r.operator_id === o.id)?.h ?? null,
      priceIndex: price.find((p) => p.operator_id === o.id)?.idx ?? null,
      dgcaRank: o.dgca_rank,
    }));
    return rankOperatorsForLeg(
      { from: leg.fromIata, to: leg.toIata, pax: leg.pax, category: leg.category },
      input,
    ).map((r) => ({
      ...r,
      alreadyAsked: requested.some((q) => q.operator_id === r.id),
    }));
  }

  // ---------- Requests ----------

  private async message(m: EntityManager, weddingId: string, operatorId: string, legIds: string[]) {
    const w = await this.weddings.find(weddingId, m);
    const [op] = await m.query(
      `SELECT coalesce(o.brand, o.legal_name) AS name,
              (SELECT phone FROM operator_contact c WHERE c.operator_id = o.id AND c.phone IS NOT NULL ORDER BY is_primary DESC LIMIT 1) AS phone,
              (SELECT email FROM operator_contact c WHERE c.operator_id = o.id AND c.email IS NOT NULL ORDER BY is_primary DESC LIMIT 1) AS email
         FROM operator o WHERE o.id = $1`,
      [operatorId],
    );
    const [brand] = await m.query(
      `SELECT coalesce(brand_name, 'ShubhJets') AS name FROM business_profile WHERE is_default`,
    );
    const legs: {
      seq: number;
      from_iata: string;
      to_iata: string;
      flight_date: string;
      window_from: string | null;
      window_to: string | null;
      pax: number;
      category: AircraftCategory | null;
      from_city: string;
      to_city: string;
      from_site: LegSite | null;
      to_site: LegSite | null;
      service_type: HeliService | null;
    }[] = await m.query(
      `SELECT l.seq, l.from_iata, l.to_iata, l.flight_date, to_char(l.window_from, 'HH24:MI') AS window_from, to_char(l.window_to, 'HH24:MI') AS window_to,
                l.pax, l.category, af.city AS from_city, at.city AS to_city, l.from_site, l.to_site, l.service_type
           FROM leg l JOIN airport af ON af.iata = l.from_iata JOIN airport at ON at.iata = l.to_iata
          WHERE l.id = ANY($1) ORDER BY l.seq`,
      [legIds],
    );
    const text = rateRequestMessage({
      operatorName: op.name,
      weddingCode: w.code,
      venueCity: w.venueCity,
      brand: brand?.name ?? 'ShubhJets',
      legs: legs.map((l) => ({
        seq: l.seq,
        from: l.from_iata,
        to: l.to_iata,
        fromCity: l.from_city,
        toCity: l.to_city,
        date: l.flight_date,
        windowFrom: l.window_from,
        windowTo: l.window_to,
        pax: l.pax,
        category: l.category,
        fromSite: l.from_site,
        toSite: l.to_site,
        service: l.service_type,
      })),
    });
    const subject = `Rate request ${w.code}`;
    return {
      operator: {
        id: operatorId,
        name: op.name as string,
        phone: (op.phone as string | null) ?? null,
        email: (op.email as string | null) ?? null,
      },
      message: text,
      // You press send yourself (BRIEF.md §5.6): these only open WhatsApp / your mail app with the text ready.
      whatsappUrl: op.phone
        ? `https://wa.me/${String(op.phone).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
        : null,
      mailtoUrl: op.email
        ? `mailto:${op.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
        : null,
    };
  }

  /** Record that you are asking these operators for rates on these legs; returns the messages to send. */
  async request(
    weddingId: string,
    input: { operatorIds: string[]; legIds?: string[]; channel: RateRequest['channel'] },
    userId: string,
  ) {
    return this.ds.transaction(async (m) => {
      const w = await this.weddings.find(weddingId, m);
      if (['SIGNED_AND_PAID', 'FLYING', 'DONE', 'LOST'].includes(w.status)) {
        throw new ConflictException(
          'Rates can only be requested for weddings that are not yet confirmed or lost',
        );
      }
      const all = (await this.legsOf(m, weddingId)).filter((l) => l.status !== 'CANCELLED');
      const legIds = input.legIds?.length ? input.legIds : all.map((l) => l.id);
      if (!legIds.length) throw new BadRequestException('Add at least one leg first');
      const unknown = legIds.filter((id) => !all.some((l) => l.id === id));
      if (unknown.length) throw fieldErrors({ legIds: 'Choose legs of this wedding' });
      const out = [];
      for (const operatorId of [...new Set(input.operatorIds)]) {
        // Rule 1: only operators that can be quoted are asked, so every reply can be used.
        await this.operators.assertQuotable(operatorId, m);
        const req = await m.getRepository(RateRequest).save(
          m.getRepository(RateRequest).create({
            weddingId,
            operatorId,
            channel: input.channel,
            sentAt: this.now(),
            documentId: null,
            createdBy: userId,
          }),
        );
        await m
          .getRepository(RateRequestLeg)
          .insert(legIds.map((legId) => ({ rateRequestId: req.id, legId })));
        out.push({ requestId: req.id, ...(await this.message(m, weddingId, operatorId, legIds)) });
      }
      for (const legId of legIds) await this.weddings.refreshLegStatus(m, legId);
      await this.weddings.markRatesRequested(m, weddingId);
      return out;
    });
  }

  /** The message again (to resend or chase). */
  async requestMessage(requestId: string) {
    const req = await this.ds.getRepository(RateRequest).findOneBy({ id: requestId });
    if (!req) throw new NotFoundException('Rate request not found');
    const legs = await this.ds
      .getRepository(RateRequestLeg)
      .find({ where: { rateRequestId: requestId } });
    return {
      requestId,
      ...(await this.message(
        this.ds.manager,
        req.weddingId,
        req.operatorId,
        legs.map((l) => l.legId),
      )),
    };
  }

  // ---------- Replies ----------

  private async validateResponse(m: EntityManager, weddingId: string, input: ResponseInput) {
    const fields: Record<string, string> = {};
    const legs = await this.legsOf(m, weddingId);
    const legIds = [...new Set(input.legIds)];
    if (!legIds.length) fields.legIds = 'Choose which leg(s) this rate covers';
    else if (legIds.some((id) => !legs.some((l) => l.id === id)))
      fields.legIds = 'Choose legs of this wedding';
    const [op] = await m.query(`SELECT id FROM operator WHERE id = $1 AND deleted_at IS NULL`, [
      input.operatorId,
    ]);
    if (!op) fields.operatorId = 'Choose an operator';
    let seats = input.seats ?? null;
    let aircraftText = input.aircraftText ?? null;
    if (input.aircraftId) {
      const [a] = await m.query(
        `SELECT type, registration, seats FROM aircraft WHERE id = $1 AND operator_id = $2`,
        [input.aircraftId, input.operatorId],
      );
      if (!a) fields.aircraftId = "Choose one of this operator's aircraft";
      else {
        seats ??= a.seats;
        aircraftText ??= [a.type, a.registration].filter(Boolean).join(' ');
      }
    } else if (!aircraftText) {
      fields.aircraftText = 'Say which aircraft (or pick one from their fleet)';
    }
    if (!Number.isSafeInteger(input.netRate) || input.netRate <= 0)
      fields.netRate = 'Enter the net rate in rupees';
    if (
      input.pricing &&
      legIds.some((id) => !isHelicopter(legs.find((l) => l.id === id)?.category ?? null))
    )
      fields.pricing = 'Hourly pricing is for helicopter legs';
    let shares = input.costShares ?? null;
    if (shares) {
      if (shares.length !== legIds.length || shares.some((s) => !Number.isSafeInteger(s) || s < 0))
        fields.costShares = 'Give one amount per leg';
      else if (shares.reduce((a, b) => a + b, 0) !== input.netRate)
        fields.costShares = 'The leg amounts must add up to the net rate';
    } else if (legIds.length && input.netRate > 0) {
      shares = splitPackage(
        input.netRate,
        legIds.map(() => 1),
      );
    }
    if (input.rateRequestId) {
      const [rq] = await m.query(
        `SELECT 1 FROM rate_request WHERE id = $1 AND wedding_id = $2 AND operator_id = $3`,
        [input.rateRequestId, weddingId, input.operatorId],
      );
      if (!rq) fields.rateRequestId = 'That request was not sent to this operator for this wedding';
    }
    if (Object.keys(fields).length) throw fieldErrors(fields);
    // Link the reply to the latest request sent to this operator for this wedding, so reply time can be measured.
    const requestId =
      input.rateRequestId ??
      ((
        await m.query(
          `SELECT id FROM rate_request WHERE wedding_id = $1 AND operator_id = $2 ORDER BY sent_at DESC LIMIT 1`,
          [weddingId, input.operatorId],
        )
      )[0]?.id as string | undefined) ??
      null;
    return { legIds, shares: shares!, seats, aircraftText, requestId };
  }

  async addResponse(
    weddingId: string,
    input: ResponseInput,
    userId: string,
  ): Promise<{ id: string }> {
    return this.ds.transaction(async (m) => {
      const w = await this.weddings.find(weddingId, m);
      if (['SIGNED_AND_PAID', 'FLYING', 'DONE'].includes(w.status))
        throw new ConflictException('This wedding is confirmed; rates are closed');
      const v = await this.validateResponse(m, weddingId, input);
      const repo = m.getRepository(RateResponse);
      const r = await repo.save(
        repo.create({
          weddingId,
          operatorId: input.operatorId,
          rateRequestId: v.requestId,
          aircraftId: input.aircraftId ?? null,
          aircraftText: v.aircraftText,
          seats: v.seats,
          netRate: input.netRate,
          pricing: input.pricing ?? null,
          inclusions: input.inclusions ?? null,
          exclusions: input.exclusions ?? null,
          cancellationTerms: input.cancellationTerms ?? null,
          // Without a schedule of its own, a reply starts with the operator's usual terms.
          cancellationSchedule:
            input.cancellationSchedule === undefined
              ? await this.operatorSchedule(m, input.operatorId)
              : input.cancellationSchedule,
          validUntil: input.validUntil ?? null,
          receivedAt: input.receivedAt ?? this.now(),
          rawText: input.rawText ?? null,
          source: 'MANUAL',
          createdBy: userId,
        }),
      );
      await m
        .getRepository(RateResponseLeg)
        .insert(
          v.legIds.map((legId, i) => ({ rateResponseId: r.id, legId, costShare: v.shares[i]! })),
        );
      for (const legId of v.legIds) await this.weddings.refreshLegStatus(m, legId);
      return { id: r.id };
    });
  }

  async updateResponse(responseId: string, input: Partial<ResponseInput>): Promise<void> {
    await this.ds.transaction(async (m) => {
      const repo = m.getRepository(RateResponse);
      const r = await repo.findOneBy({ id: responseId });
      if (!r) throw new NotFoundException('Rate not found');
      const [quoted] = await m.query(
        `SELECT 1 FROM quote_line ql JOIN quote q ON q.id = ql.quote_id
          WHERE ql.rate_response_id = $1 AND q.status <> 'DRAFT' LIMIT 1`,
        [responseId],
      );
      if (
        quoted &&
        (input.netRate !== undefined ||
          input.pricing !== undefined ||
          input.legIds !== undefined ||
          input.costShares !== undefined)
      ) {
        throw new ConflictException(
          'This rate is on a quote; its price and legs can no longer change. Record the new rate as a new reply.',
        );
      }
      const before = (
        await m.getRepository(RateResponseLeg).find({ where: { rateResponseId: responseId } })
      ).map((x) => x.legId);
      const merged: ResponseInput = {
        operatorId: r.operatorId,
        rateRequestId: input.rateRequestId === undefined ? r.rateRequestId : input.rateRequestId,
        aircraftId: input.aircraftId === undefined ? r.aircraftId : input.aircraftId,
        aircraftText: input.aircraftText === undefined ? r.aircraftText : input.aircraftText,
        seats: input.seats === undefined ? r.seats : input.seats,
        netRate: input.netRate ?? r.netRate,
        pricing: input.pricing === undefined ? r.pricing : input.pricing,
        legIds: input.legIds ?? before,
        costShares:
          input.costShares ??
          (input.netRate === undefined && input.legIds === undefined
            ? (
                await m
                  .getRepository(RateResponseLeg)
                  .find({ where: { rateResponseId: responseId } })
              )
                .sort((a, b) => before.indexOf(a.legId) - before.indexOf(b.legId))
                .map((x) => x.costShare)
            : null),
      };
      const v = await this.validateResponse(m, r.weddingId, merged);
      Object.assign(r, {
        aircraftId: merged.aircraftId ?? null,
        aircraftText: v.aircraftText,
        seats: v.seats,
        netRate: merged.netRate,
        pricing: merged.pricing ?? null,
        rateRequestId: v.requestId,
      });
      for (const k of [
        'inclusions',
        'exclusions',
        'cancellationTerms',
        'cancellationSchedule',
        'validUntil',
        'rawText',
      ] as const) {
        if (input[k] !== undefined) (r as unknown as Record<string, unknown>)[k] = input[k];
      }
      await repo.save(r);
      await m.getRepository(RateResponseLeg).delete({ rateResponseId: responseId });
      await m.getRepository(RateResponseLeg).insert(
        v.legIds.map((legId, i) => ({
          rateResponseId: responseId,
          legId,
          costShare: v.shares[i]!,
        })),
      );
      // A leg this reply no longer covers can't keep it as its chosen jet.
      for (const legId of before.filter((l) => !v.legIds.includes(l))) {
        await m.getRepository(LegChoice).delete({ legId, rateResponseId: responseId });
      }
      for (const legId of new Set([...before, ...v.legIds]))
        await this.weddings.refreshLegStatus(m, legId);
    });
  }

  async deleteResponse(responseId: string): Promise<void> {
    await this.ds.transaction(async (m) => {
      const r = await m.getRepository(RateResponse).findOneBy({ id: responseId });
      if (!r) throw new NotFoundException('Rate not found');
      const [quoted] = await m.query(
        `SELECT 1 FROM quote_line ql JOIN quote q ON q.id = ql.quote_id
          WHERE ql.rate_response_id = $1 AND q.status <> 'DRAFT' LIMIT 1`,
        [responseId],
      );
      if (quoted) throw new ConflictException('This rate is on an issued quote and must be kept');
      // A draft just loses the line; it is rebuilt from the chosen jets.
      await m.query(
        `DELETE FROM quote_line ql USING quote q WHERE ql.quote_id = q.id AND q.status = 'DRAFT' AND ql.rate_response_id = $1`,
        [responseId],
      );
      const legs = (
        await m.getRepository(RateResponseLeg).find({ where: { rateResponseId: responseId } })
      ).map((x) => x.legId);
      await m.getRepository(LegChoice).delete({ rateResponseId: responseId });
      await m.getRepository(RateResponse).remove(r);
      for (const legId of legs) await this.weddings.refreshLegStatus(m, legId);
    });
  }

  // ---------- Choosing ----------

  /**
   * Choose the jet(s) for a leg (several replies = several jets). Every chosen operator must be quotable
   * right now (rule 1), every rate still valid, and together they must seat everyone on the leg.
   */
  async choose(legId: string, responseIds: string[]): Promise<void> {
    await this.ds.transaction(async (m) => {
      const leg = await m.getRepository(Leg).findOneBy({ id: legId });
      if (!leg) throw new NotFoundException('Leg not found');
      if (!['OPEN', 'RATES_REQUESTED', 'RATES_IN', 'CHOSEN'].includes(leg.status)) {
        // A quoted leg's jets change only while a new quote version is being drafted.
        const [draft] = await m.query(
          `SELECT 1 FROM quote WHERE wedding_id = $1 AND status = 'DRAFT'`,
          [leg.weddingId],
        );
        if (leg.status !== 'QUOTED' || !draft)
          throw new ConflictException(
            'This leg is already on a quote; start a new quote version to change its jets',
          );
      }
      const ids = [...new Set(responseIds)];
      const before = (await m.getRepository(LegChoice).find({ where: { legId } }))
        .map((c) => c.rateResponseId)
        .sort();
      let seats = 0;
      for (const id of ids) {
        const [r] = await m.query(
          `SELECT r.id, r.operator_id, r.seats, r.valid_until, coalesce(o.brand, o.legal_name) AS name
             FROM rate_response r JOIN rate_response_leg rl ON rl.rate_response_id = r.id AND rl.leg_id = $2
             JOIN operator o ON o.id = r.operator_id WHERE r.id = $1`,
          [id, legId],
        );
        if (!r) throw new BadRequestException('That rate does not cover this leg');
        await this.operators.assertQuotable(r.operator_id, m);
        if (r.valid_until && new Date(r.valid_until) < this.now()) {
          throw new ConflictException(
            `${r.name}'s rate expired on ${formatDateTime(new Date(r.valid_until))}. Ask them to confirm it and update the validity first.`,
          );
        }
        if (!r.seats)
          throw new ConflictException(`Add the number of seats to ${r.name}'s rate first`);
        seats += r.seats;
      }
      if (ids.length && seats < leg.pax) {
        throw new ConflictException(
          `The chosen jet${ids.length > 1 ? 's seat' : ' seats'} ${seats}; this leg has ${leg.pax} passengers. Add another jet.`,
        );
      }
      await m.getRepository(LegChoice).delete({ legId });
      if (ids.length)
        await m
          .getRepository(LegChoice)
          .insert(ids.map((rateResponseId) => ({ legId, rateResponseId })));
      if (JSON.stringify(before) !== JSON.stringify([...ids].sort())) {
        await this.audit.record(
          {
            entity: 'leg',
            entityId: legId,
            action: 'CHOICE_SET',
            diff: { from: before, to: [...ids].sort() },
          },
          m,
        );
      }
      await this.weddings.refreshLegStatus(m, legId);
    });
  }

  // ---------- Overview and comparison ----------

  /** Everything the Rates screen shows: requests (who replied), replies, and the comparison per leg. */
  async overview(weddingId: string) {
    await this.weddings.find(weddingId);
    const now = this.now();
    const chaseHours = await this.settings.get<number>('today.chase_operator_hours');
    const legs = await this.legsOf(this.ds.manager, weddingId);
    const requests: {
      id: string;
      operator_id: string;
      name: string;
      channel: string;
      sent_at: Date;
      leg_ids: string[];
    }[] = await this.ds.query(
      `SELECT rq.id, rq.operator_id, coalesce(o.brand, o.legal_name) AS name, rq.channel, rq.sent_at,
              coalesce((SELECT array_agg(leg_id) FROM rate_request_leg WHERE rate_request_id = rq.id), '{}') AS leg_ids
         FROM rate_request rq JOIN operator o ON o.id = rq.operator_id WHERE rq.wedding_id = $1 ORDER BY rq.sent_at`,
      [weddingId],
    );
    const responses: Record<string, unknown>[] = await this.ds.query(
      `SELECT r.*, coalesce(o.brand, o.legal_name) AS operator_name, rq.sent_at AS request_sent_at,
              a.type AS aircraft_type, a.registration AS aircraft_registration, a.category AS aircraft_category
         FROM rate_response r JOIN operator o ON o.id = r.operator_id
         LEFT JOIN rate_request rq ON rq.id = r.rate_request_id
         LEFT JOIN aircraft a ON a.id = r.aircraft_id
        WHERE r.wedding_id = $1 ORDER BY r.received_at`,
      [weddingId],
    );
    const shares: { rate_response_id: string; leg_id: string; cost_share: string }[] =
      await this.ds.query(
        `SELECT rl.* FROM rate_response_leg rl JOIN rate_response r ON r.id = rl.rate_response_id WHERE r.wedding_id = $1`,
        [weddingId],
      );
    const choices: { leg_id: string; rate_response_id: string }[] = await this.ds.query(
      `SELECT lc.* FROM leg_choice lc JOIN leg l ON l.id = lc.leg_id WHERE l.wedding_id = $1`,
      [weddingId],
    );
    const quotable = new Map<string, { ok: boolean; reason: string | null }>();
    for (const opId of new Set(responses.map((r) => String(r.operator_id)))) {
      try {
        await this.operators.assertQuotable(opId);
        quotable.set(opId, { ok: true, reason: null });
      } catch (err) {
        quotable.set(opId, {
          ok: false,
          reason:
            ((err as ConflictException).getResponse() as { reason?: string }).reason ??
            'Not quotable',
        });
      }
    }

    const replies = responses.map((r) => {
      const legsCovered = shares
        .filter((s) => s.rate_response_id === r.id)
        .map((s) => ({ legId: s.leg_id, costShare: Number(s.cost_share) }));
      const validUntil = r.valid_until ? new Date(r.valid_until as string) : null;
      return {
        id: r.id as string,
        operator: { id: r.operator_id as string, name: r.operator_name as string },
        rateRequestId: (r.rate_request_id as string | null) ?? null,
        aircraftId: (r.aircraft_id as string | null) ?? null,
        aircraft:
          (r.aircraft_text as string | null) ??
          [r.aircraft_type, r.aircraft_registration].filter(Boolean).join(' '),
        category: (r.aircraft_category as AircraftCategory | null) ?? null,
        seats: (r.seats as number | null) ?? null,
        netRate: Number(r.net_rate),
        /** Helicopter replies: the hourly breakdown (internal only). */
        pricing: (r.pricing as HourlyPricing | null) ?? null,
        legs: legsCovered,
        isPackage: legsCovered.length > 1,
        inclusions: r.inclusions as string | null,
        exclusions: r.exclusions as string | null,
        cancellationTerms: r.cancellation_terms as string | null,
        validUntil,
        expired: !!validUntil && validUntil < now,
        receivedAt: new Date(r.received_at as string),
        replyHours: r.request_sent_at
          ? hours(new Date(r.request_sent_at as string), new Date(r.received_at as string))
          : null,
        quotable: quotable.get(String(r.operator_id))!,
        rawText: r.raw_text as string | null,
      };
    });

    const requestRows = requests.map((q) => {
      const reply =
        replies.find((r) => r.rateRequestId === q.id) ??
        replies.find((r) => r.operator.id === q.operator_id && r.receivedAt >= new Date(q.sent_at));
      const waited = hours(new Date(q.sent_at), now);
      return {
        id: q.id,
        operator: { id: q.operator_id, name: q.name },
        channel: q.channel,
        sentAt: q.sent_at,
        legIds: q.leg_ids,
        replied: !!reply,
        replyHours: reply ? hours(new Date(q.sent_at), reply.receivedAt) : null,
        waitingHours: reply ? null : waited,
        overdue: !reply && waited >= chaseHours,
      };
    });

    const comparison = legs.map((leg) => {
      const rows = replies
        .filter((r) => r.legs.some((l) => l.legId === leg.id))
        .map((r) => {
          const cost = r.legs.find((l) => l.legId === leg.id)!.costShare;
          return {
            responseId: r.id,
            operator: r.operator,
            aircraft: r.aircraft,
            category: r.category,
            seats: r.seats,
            cost,
            perSeat: r.seats ? Math.round(cost / r.seats) : null,
            isPackage: r.isPackage,
            netRate: r.netRate,
            pricing: r.pricing,
            validUntil: r.validUntil,
            expired: r.expired,
            replyHours: r.replyHours,
            quotable: r.quotable,
            seatsCoverPax: !!r.seats && r.seats >= leg.pax,
            chosen: choices.some((c) => c.leg_id === leg.id && c.rate_response_id === r.id),
          };
        })
        .sort((a, b) => a.cost - b.cost);
      // "Cheapest" marks the cheapest jet that can be chosen on its own (seats everyone).
      const usable = rows.filter((r) => r.quotable.ok && !r.expired && r.seatsCoverPax);
      const chosen = rows.filter((r) => r.chosen);
      return {
        legId: leg.id,
        seq: leg.seq,
        from: leg.fromIata,
        to: leg.toIata,
        date: leg.flightDate,
        pax: leg.pax,
        category: leg.category,
        status: leg.status,
        rows,
        cheapestId: usable[0]?.responseId ?? null,
        chosenSeats: chosen.reduce((s, r) => s + (r.seats ?? 0), 0),
        chosenCost: chosen.reduce((s, r) => s + r.cost, 0),
      };
    });

    return {
      requests: requestRows,
      replies,
      comparison,
      summary: {
        asked: requestRows.length,
        replied: requestRows.filter((r) => r.replied).length,
        overdue: requestRows.filter((r) => r.overdue).length,
        legsChosen: comparison.filter((c) => c.rows.some((r) => r.chosen)).length,
        legs: comparison.length,
      },
    };
  }
}
