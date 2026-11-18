import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  LEAD_SOURCES,
  PARTNER_STATUSES,
  WEDDING_STATUSES,
  addDays,
  buildTodayActions,
  istToInstant,
  monthRange,
  monthTracker,
  operatorExpiries,
  quoteReference,
  seasonRange,
  snoozeUntil,
  toIstDate,
  type AircraftCategory,
  type Contact,
  type TodayFacts,
} from '@shubhjets/shared';
import type { DataSource } from 'typeorm';
import { BusinessProfilesService } from '../business-profiles/business-profiles.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { SettingsService } from '../settings/settings.service.js';

/** The routes the website sells (WEBSITE.md route pages), always shown in route coverage. */
const KEY_ROUTES: [string, string][] = [
  ['DEL', 'UDR'],
  ['BOM', 'UDR'],
  ['DEL', 'JAI'],
  ['DEL', 'JDH'],
  ['BOM', 'GOX'],
];

/** Who to message about a wedding: the partner when there is one, otherwise the client. */
const CONTACT_SQL = `
  CASE WHEN pa.id IS NOT NULL THEN coalesce(pa.contact_person, pa.firm) ELSE c.name END AS contact_name,
  CASE WHEN pa.id IS NOT NULL THEN pa.phone ELSE c.phone END AS contact_phone`;
const CONTACT_JOIN = `
  LEFT JOIN partner pa ON pa.id = w.partner_id
  LEFT JOIN client c ON c.id = w.client_id`;

type Row = Record<string, unknown>;
const contact = (r: Row, prefix = 'contact'): Contact => ({
  name: (r[`${prefix}_name`] as string | null) ?? null,
  phone: (r[`${prefix}_phone`] as string | null) ?? null,
});
const iso = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? toIstDate(v) : String(v).slice(0, 10);

/**
 * The Today screen in one call (BRIEF.md §5.4): the Do now list, the month against the target,
 * and the overview sections. Everything is read-only except "Later".
 */
@Injectable()
export class TodayService {
  now: () => Date = () => new Date();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
    private readonly profiles: BusinessProfilesService,
  ) {}

  async today() {
    const now = this.now();
    const today = toIstDate(now);
    const [facts, rules, snoozed, tracker, board, pipeline, sources, routes] = await Promise.all([
      this.facts(now, today),
      this.rules(now, today),
      this.ds.query(`SELECT action_key FROM today_snooze WHERE until > $1`, [now]) as Promise<
        { action_key: string }[]
      >,
      this.tracker(today),
      this.board(),
      this.pipeline(today),
      this.leadSources(today),
      this.routes(today),
    ]);
    const hidden = new Set(snoozed.map((s) => s.action_key));
    const all = buildTodayActions(facts, rules);
    return {
      today,
      generatedAt: now,
      actions: all.filter((a) => !hidden.has(a.key)),
      snoozedCount: all.filter((a) => hidden.has(a.key)).length,
      tracker,
      board,
      pipeline,
      leadSources: sources,
      routes,
    };
  }

  /** "Later": hide an action until 7 am IST tomorrow. Returns what Undo needs. */
  async snooze(key: string, userId: string) {
    const until = snoozeUntil(toIstDate(this.now()));
    await this.ds.query(
      `INSERT INTO today_snooze (action_key, until, created_by) VALUES ($1, $2, $3)
       ON CONFLICT (action_key) DO UPDATE SET until = EXCLUDED.until, created_by = EXCLUDED.created_by`,
      [key, until, userId],
    );
    return { key, until };
  }

  async unsnooze(key: string): Promise<void> {
    await this.ds.query(`DELETE FROM today_snooze WHERE action_key = $1`, [key]);
  }

  private async rules(now: Date, today: string) {
    const [chase, warn, ids, profile] = await Promise.all([
      this.settings.get<number>('today.chase_operator_hours'),
      this.settings.get<number>('today.quote_expiry_warn_hours'),
      this.settings.get<number>('today.guest_ids_due_days'),
      this.profiles.getDefault(),
    ]);
    return {
      now,
      today,
      brand: profile?.brandName ?? 'ShubhJets',
      chaseAfterHours: chase,
      quoteWarnHours: warn,
      guestIdsDueDays: ids,
    };
  }

  private async facts(now: Date, today: string): Promise<TodayFacts> {
    const q = (sql: string, params: unknown[] = []) => this.ds.query(sql, params) as Promise<Row[]>;
    const [
      enquiries,
      rateWaits,
      quoteNeeded,
      quotes,
      toConfirm,
      guestIds,
      flown,
      payouts,
      commissions,
      followUps,
      verifiedDocs,
      profile,
    ] = await Promise.all([
      q(`SELECT w.id, w.code, w.venue_city, w.created_at,
                EXISTS (SELECT 1 FROM enquiry e WHERE e.wedding_id = w.id AND e.source = 'WEBSITE') AS from_website,
                (SELECT count(*)::int FROM leg l WHERE l.wedding_id = w.id AND l.status <> 'CANCELLED') AS legs,
                (SELECT count(*)::int FROM rate_request r WHERE r.wedding_id = w.id) AS rate_requests,
                ${CONTACT_SQL}
           FROM wedding w ${CONTACT_JOIN}
          WHERE w.deleted_at IS NULL AND w.status = 'ENQUIRY'`),
      // Operators asked for rates who haven't replied, while the wedding still needs rates.
      q(`WITH asked AS (SELECT wedding_id, operator_id, min(sent_at) AS sent_at FROM rate_request GROUP BY 1, 2),
              replied AS (SELECT DISTINCT wedding_id, operator_id FROM rate_response)
         SELECT a.wedding_id, a.operator_id, a.sent_at, w.code, w.venue_city,
                coalesce(o.brand, o.legal_name) AS operator, oc.name AS contact_name, oc.phone AS contact_phone,
                (SELECT count(*)::int FROM asked x WHERE x.wedding_id = a.wedding_id) AS asked,
                (SELECT count(*)::int FROM asked x JOIN replied y USING (wedding_id, operator_id)
                  WHERE x.wedding_id = a.wedding_id) AS replies
           FROM asked a
           JOIN wedding w ON w.id = a.wedding_id
           JOIN operator o ON o.id = a.operator_id
           LEFT JOIN LATERAL (SELECT name, phone FROM operator_contact
                               WHERE operator_id = o.id ORDER BY is_primary DESC, created_at LIMIT 1) oc ON true
          WHERE w.deleted_at IS NULL AND w.status IN ('ENQUIRY', 'RATES_REQUESTED')
            AND NOT EXISTS (SELECT 1 FROM replied r WHERE r.wedding_id = a.wedding_id AND r.operator_id = a.operator_id)
            AND EXISTS (SELECT 1 FROM leg l WHERE l.wedding_id = w.id AND l.status <> 'CANCELLED'
                         AND NOT EXISTS (SELECT 1 FROM leg_choice lc WHERE lc.leg_id = l.id))`),
      q(`SELECT w.id, w.code,
                count(l.id)::int AS legs,
                count(l.id) FILTER (WHERE EXISTS (SELECT 1 FROM rate_response_leg rl WHERE rl.leg_id = l.id))::int AS with_rates,
                count(l.id) FILTER (WHERE EXISTS (SELECT 1 FROM leg_choice lc WHERE lc.leg_id = l.id))::int AS chosen,
                EXISTS (SELECT 1 FROM quote qd WHERE qd.wedding_id = w.id AND qd.status = 'DRAFT') AS has_draft
           FROM wedding w JOIN leg l ON l.wedding_id = w.id AND l.status <> 'CANCELLED'
          WHERE w.deleted_at IS NULL AND w.status = 'RATES_REQUESTED'
            AND NOT EXISTS (SELECT 1 FROM quote x WHERE x.wedding_id = w.id AND x.status IN ('ISSUED', 'SHARED', 'ACCEPTED'))
          GROUP BY w.id, w.code`),
      q(`SELECT w.id AS wedding_id, w.code, w.venue_city, qt.id AS quote_id, qt.version, qt.status, qt.valid_until,
                ${CONTACT_SQL},
                coalesce((SELECT json_agg(json_build_object('name', a.name, 'at', a.accepted_at) ORDER BY a.accepted_at DESC)
                            FROM document d JOIN document_version dv ON dv.document_id = d.id
                            JOIN share s ON s.document_version_id = dv.id
                            JOIN share_acceptance a ON a.share_id = s.id
                           WHERE d.quote_id = qt.id), '[]') AS acceptances
           FROM wedding w ${CONTACT_JOIN}
           JOIN LATERAL (SELECT * FROM quote x WHERE x.wedding_id = w.id AND x.status NOT IN ('DRAFT', 'SUPERSEDED')
                          ORDER BY x.version DESC LIMIT 1) qt ON true
          WHERE w.deleted_at IS NULL AND w.status IN ('RATES_REQUESTED', 'QUOTED')`),
      q(`SELECT w.id, w.code, ${CONTACT_SQL},
                (SELECT min(l.flight_date) FROM leg l WHERE l.wedding_id = w.id AND l.status <> 'CANCELLED') AS first_flight
           FROM wedding w ${CONTACT_JOIN}
          WHERE w.deleted_at IS NULL AND w.status = 'QUOTED'
            AND EXISTS (SELECT 1 FROM quote x WHERE x.wedding_id = w.id AND x.status = 'ACCEPTED')`),
      // Per leg flying soon: passengers without an ID received; the worst leg stands for the wedding.
      q(
        `SELECT w.id, w.code, ${CONTACT_SQL}, min(l.flight_date) AS first_flight,
                max(greatest(l.pax - (SELECT count(*) FROM guest g WHERE g.leg_id = l.id AND g.id_received), 0))::int AS missing
           FROM wedding w ${CONTACT_JOIN}
           JOIN leg l ON l.wedding_id = w.id AND l.status NOT IN ('CANCELLED', 'FLOWN')
          WHERE w.deleted_at IS NULL AND w.status IN ('QUOTED', 'SIGNED_AND_PAID', 'FLYING')
            AND l.flight_date BETWEEN $1::date AND $2::date
          GROUP BY w.id, w.code, pa.id, pa.contact_person, pa.firm, pa.phone, c.name, c.phone`,
        [today, addDays(today, 30)],
      ),
      q(
        `SELECT w.id AS wedding_id, w.code, l.id AS leg_id, l.seq, l.from_iata, l.to_iata, l.flight_date
           FROM leg l JOIN wedding w ON w.id = l.wedding_id
          WHERE w.deleted_at IS NULL AND l.status = 'CONFIRMED' AND l.flight_date < $1::date
          ORDER BY l.flight_date, l.seq`,
        [today],
      ),
      q(`SELECT p.id, p.amount, p.gst_amount, w.id AS wedding_id, w.code, coalesce(o.brand, o.legal_name) AS operator,
                (SELECT min(l.flight_date) FROM leg l WHERE l.wedding_id = w.id AND l.status NOT IN ('CANCELLED', 'FLOWN')) AS first_flight
           FROM payment p JOIN wedding w ON w.id = p.wedding_id JOIN operator o ON o.id = p.operator_id
          WHERE p.deleted_at IS NULL AND p.direction = 'OPERATOR_OUT' AND p.status = 'PAYABLE' AND w.deleted_at IS NULL`),
      q(`SELECT w.id, w.code, pa.firm,
                coalesce((qt.totals->>'commission')::bigint, 0)
                  - coalesce((SELECT sum(p.amount) FROM payment p WHERE p.wedding_id = w.id AND p.direction = 'PARTNER_OUT'
                               AND p.deleted_at IS NULL), 0) AS remaining
           FROM wedding w JOIN partner pa ON pa.id = w.partner_id
           JOIN quote qt ON qt.wedding_id = w.id AND qt.status = 'ACCEPTED'
          WHERE w.deleted_at IS NULL AND w.status = 'DONE'`),
      q(
        `SELECT id, firm, contact_person, phone, next_follow_up_on, status FROM partner
          WHERE deleted_at IS NULL AND status <> 'INACTIVE' AND next_follow_up_on <= $1::date
          ORDER BY next_follow_up_on`,
        [today],
      ),
      q(`SELECT o.id, coalesce(o.brand, o.legal_name) AS operator, oc.name AS contact_name, oc.phone AS contact_phone,
                coalesce(json_agg(json_build_object('kind', d.kind, 'expiresOn', d.expires_on, 'verifiedOn', d.verified_on))
                         FILTER (WHERE d.id IS NOT NULL), '[]') AS docs
           FROM operator o
           LEFT JOIN operator_document d ON d.operator_id = o.id
           LEFT JOIN LATERAL (SELECT name, phone FROM operator_contact
                               WHERE operator_id = o.id ORDER BY is_primary DESC, created_at LIMIT 1) oc ON true
          WHERE o.deleted_at IS NULL AND o.verified_at IS NOT NULL
          GROUP BY o.id, o.brand, o.legal_name, oc.name, oc.phone`),
      this.profiles.getDefault(),
    ]);

    const confirmations = await Promise.all(
      toConfirm.map(async (r) => {
        const s = await this.payments.summary(r.id as string);
        return {
          weddingId: r.id as string,
          code: r.code as string,
          contact: contact(r),
          checklist: s.checklist,
          dueToConfirm: s.position.dueToConfirm,
          firstFlight: iso(r.first_flight),
        };
      }),
    );

    return {
      enquiries: enquiries.map((r) => ({
        weddingId: r.id as string,
        code: r.code as string,
        city: r.venue_city as string | null,
        contact: contact(r),
        fromWebsite: r.from_website as boolean,
        createdAt: r.created_at as Date,
        legs: r.legs as number,
        rateRequests: r.rate_requests as number,
      })),
      rateWaits: rateWaits.map((r) => ({
        weddingId: r.wedding_id as string,
        code: r.code as string,
        city: r.venue_city as string | null,
        operatorId: r.operator_id as string,
        operator: r.operator as string,
        contact: contact(r),
        sentAt: r.sent_at as Date,
        repliesIn: r.replies as number,
        asked: r.asked as number,
      })),
      quoteNeeded: quoteNeeded.map((r) => ({
        weddingId: r.id as string,
        code: r.code as string,
        legs: r.legs as number,
        legsWithRates: r.with_rates as number,
        legsChosen: r.chosen as number,
        hasDraft: r.has_draft as boolean,
      })),
      quotes: quotes.map((r) => ({
        weddingId: r.wedding_id as string,
        code: r.code as string,
        city: r.venue_city as string | null,
        quoteId: r.quote_id as string,
        label: quoteReference(r.code as string, r.version as number),
        status: r.status as 'ISSUED' | 'SHARED' | 'ACCEPTED' | 'EXPIRED',
        validUntil: (r.valid_until as Date | null) ?? null,
        contact: contact(r),
        linkAcceptances: (r.acceptances as { name: string; at: string }[]).map((a) => ({
          name: a.name,
          at: new Date(a.at),
        })),
      })),
      confirmations,
      guestIds: guestIds.map((r) => ({
        weddingId: r.id as string,
        code: r.code as string,
        contact: contact(r),
        firstFlight: iso(r.first_flight)!,
        missing: r.missing as number,
      })),
      flown: flown.map((r) => ({
        weddingId: r.wedding_id as string,
        code: r.code as string,
        legId: r.leg_id as string,
        seq: r.seq as number,
        route: `${r.from_iata} → ${r.to_iata}`,
        flightDate: iso(r.flight_date)!,
      })),
      payouts: payouts.map((r) => ({
        weddingId: r.wedding_id as string,
        code: r.code as string,
        paymentId: r.id as string,
        operator: r.operator as string,
        amount: Number(r.amount) + Number(r.gst_amount ?? 0),
        firstFlight: iso(r.first_flight),
      })),
      commissions: commissions.map((r) => ({
        weddingId: r.id as string,
        code: r.code as string,
        partner: r.firm as string,
        remaining: Number(r.remaining),
      })),
      followUps: followUps.map((r) => ({
        partnerId: r.id as string,
        firm: r.firm as string,
        contact: {
          name: (r.contact_person as string | null) ?? null,
          phone: (r.phone as string | null) ?? null,
        },
        due: iso(r.next_follow_up_on)!,
        status: r.status as string,
      })),
      expiries: verifiedDocs.flatMap((r) =>
        operatorExpiries(
          {
            nsopNo: null,
            safetyDisclosureUrl: null,
            docs: r.docs as {
              kind: 'NSOP' | 'INSURANCE' | 'OPERATOR_AGREEMENT';
              expiresOn: string | null;
              verifiedOn: string | null;
            }[],
          },
          today,
        ).map((e) => ({
          operatorId: r.id as string,
          operator: r.operator as string,
          kind: e.kind,
          expiresOn: e.expiresOn,
          contact: contact(r),
        })),
      ),
      profile: profile ? { id: profile.id, warnings: profile.readiness.warnings } : null,
    };
  }

  /** What you keep this month against the target (and margin before commission), and the season so far. */
  private async tracker(today: string) {
    const month = monthRange(today);
    const season = seasonRange(today);
    const sql = `SELECT count(*)::int AS n,
                        coalesce(sum((q.totals->>'margin')::bigint), 0)::bigint AS margin,
                        coalesce(sum((q.totals->>'netMargin')::bigint), 0)::bigint AS net
                   FROM wedding w JOIN quote q ON q.wedding_id = w.id AND q.status = 'ACCEPTED'
                  WHERE w.deleted_at IS NULL AND w.status IN ('SIGNED_AND_PAID', 'FLYING', 'DONE')
                    AND w.confirmed_at >= $1 AND w.confirmed_at < $2`;
    const range = (from: string, to: string) => [istToInstant(from), istToInstant(addDays(to, 1))];
    const [[m], [s], target] = await Promise.all([
      this.ds.query(sql, range(month.from, month.to)),
      this.ds.query(sql, range(season.from, season.to)),
      this.settings.get<number>('target.monthly_margin_paise'),
    ]);
    const seasonMargin = Number(s.margin);
    return {
      month: {
        ...monthTracker(today, { keep: Number(m.net), margin: Number(m.margin) }, target),
        weddingsConfirmed: m.n as number,
      },
      season: {
        label: season.label,
        margin: seasonMargin,
        keep: Number(s.net),
        weddingsConfirmed: s.n as number,
        averageMargin: s.n ? Math.round(seasonMargin / (s.n as number)) : 0,
      },
    };
  }

  private async board() {
    const rows: { status: string; n: number; value: string | null; margin: string | null }[] =
      await this.ds.query(
        `SELECT w.status, count(*)::int AS n,
                sum((q.totals->>'sellSubtotal')::bigint) AS value, sum((q.totals->>'margin')::bigint) AS margin
           FROM wedding w
           LEFT JOIN LATERAL (SELECT totals FROM quote x WHERE x.wedding_id = w.id AND x.status <> 'DRAFT'
                               ORDER BY (x.status = 'ACCEPTED') DESC, x.version DESC LIMIT 1) q ON true
          WHERE w.deleted_at IS NULL GROUP BY w.status`,
      );
    return WEDDING_STATUSES.map((status) => {
      const r = rows.find((x) => x.status === status);
      return {
        status,
        count: r?.n ?? 0,
        value: Number(r?.value ?? 0),
        margin: Number(r?.margin ?? 0),
      };
    });
  }

  private async pipeline(today: string) {
    const rows: { status: string; n: number; due: number }[] = await this.ds.query(
      `SELECT status, count(*)::int AS n,
              count(*) FILTER (WHERE next_follow_up_on <= $1::date)::int AS due
         FROM partner WHERE deleted_at IS NULL GROUP BY status`,
      [today],
    );
    return {
      counts: PARTNER_STATUSES.map((status) => ({
        status,
        count: rows.find((r) => r.status === status)?.n ?? 0,
      })),
      followUpsDue: rows.filter((r) => r.status !== 'INACTIVE').reduce((s, r) => s + r.due, 0),
    };
  }

  /** Lead sources this season: enquiries, quotes, bookings and margin, plus website taps. */
  private async leadSources(today: string) {
    const season = seasonRange(today);
    const from = istToInstant(season.from);
    const to = istToInstant(addDays(season.to, 1));
    const [rows, taps]: [
      {
        lead_source: string;
        enquiries: number;
        quotes: number;
        bookings: number;
        margin: string;
      }[],
      { lead: string; n: number }[],
    ] = await Promise.all([
      this.ds.query(
        `SELECT w.lead_source,
                count(*) FILTER (WHERE w.created_at >= $1 AND w.created_at < $2)::int AS enquiries,
                count(*) FILTER (WHERE w.created_at >= $1 AND w.created_at < $2 AND EXISTS
                  (SELECT 1 FROM quote q WHERE q.wedding_id = w.id AND q.status <> 'DRAFT'))::int AS quotes,
                count(*) FILTER (WHERE w.confirmed_at >= $1 AND w.confirmed_at < $2
                  AND w.status IN ('SIGNED_AND_PAID', 'FLYING', 'DONE'))::int AS bookings,
                coalesce(sum((SELECT (q.totals->>'margin')::bigint FROM quote q
                               WHERE q.wedding_id = w.id AND q.status = 'ACCEPTED' LIMIT 1))
                  FILTER (WHERE w.confirmed_at >= $1 AND w.confirmed_at < $2
                          AND w.status IN ('SIGNED_AND_PAID', 'FLYING', 'DONE')), 0)::bigint AS margin
           FROM wedding w WHERE w.deleted_at IS NULL GROUP BY w.lead_source`,
        [from, to],
      ),
      this.ds.query(
        `SELECT coalesce(payload->>'leadSource', 'WEBSITE') AS lead, count(*)::int AS n FROM enquiry
          WHERE source IN ('WHATSAPP_TAP', 'CALL_TAP') AND created_at >= $1 AND created_at < $2 GROUP BY 1`,
        [from, to],
      ),
    ]);
    return {
      season: season.label,
      rows: LEAD_SOURCES.map((source) => {
        const r = rows.find((x) => x.lead_source === source);
        return {
          source,
          enquiries: r?.enquiries ?? 0,
          quotes: r?.quotes ?? 0,
          bookings: r?.bookings ?? 0,
          margin: Number(r?.margin ?? 0),
          taps: taps.find((t) => t.lead === source)?.n ?? 0,
        };
      }).filter((r) => r.enquiries || r.bookings || r.taps),
    };
  }

  /**
   * Verified jets per route: aircraft of usable operators based at either end. Routes
   * are the website's route pages plus every route with a flight in the next 120 days.
   */
  private async routes(today: string) {
    const upcoming: { from_iata: string; to_iata: string }[] = await this.ds.query(
      `SELECT DISTINCT l.from_iata, l.to_iata FROM leg l JOIN wedding w ON w.id = l.wedding_id
        WHERE w.deleted_at IS NULL AND w.status NOT IN ('LOST', 'DONE') AND l.status <> 'CANCELLED'
          AND l.flight_date BETWEEN $1::date AND $2::date`,
      [today, addDays(today, 120)],
    );
    // Return flights are the same route: DEL → UDR and UDR → DEL show once.
    const both = (a: string, b: string) => [a, b].sort().join('-');
    const pairs = new Map<string, [string, string]>();
    for (const [a, b] of KEY_ROUTES) pairs.set(both(a, b), [a, b]);
    for (const r of upcoming)
      if (!pairs.has(both(r.from_iata, r.to_iata)))
        pairs.set(both(r.from_iata, r.to_iata), [r.from_iata, r.to_iata]);
    const origins = [...new Set([...pairs.values()].flat())];
    const jets: { base: string; category: AircraftCategory; n: number }[] = await this.ds.query(
      `SELECT coalesce(a.base_airport, b.airport_iata) AS base, a.category, count(DISTINCT a.id)::int AS n
         FROM aircraft a JOIN operator o ON o.id = a.operator_id
         LEFT JOIN operator_base b ON b.operator_id = o.id AND a.base_airport IS NULL
        WHERE a.deleted_at IS NULL AND o.deleted_at IS NULL AND o.status IN ('VERIFIED', 'EXPIRING_SOON')
          AND coalesce(a.base_airport, b.airport_iata) = ANY($1)
        GROUP BY 1, 2`,
      [origins],
    );
    const upcomingKeys = new Set(upcoming.map((r) => both(r.from_iata, r.to_iata)));
    return [...pairs.entries()].map(([key, [from, to]]) => {
      // A jet based at either end can fly the route (positioning is part of its price).
      const here = Object.values(
        jets
          .filter((j) => j.base === from || j.base === to)
          .reduce<Record<string, { category: AircraftCategory; n: number }>>((acc, j) => {
            const k = j.category;
            acc[k] = { category: k, n: (acc[k]?.n ?? 0) + j.n };
            return acc;
          }, {}),
      );
      return {
        from,
        to,
        upcoming: upcomingKeys.has(key),
        total: here.reduce((s, j) => s + j.n, 0),
        byCategory: here.map((j) => ({ category: j.category, count: j.n })),
      };
    });
  }
}
