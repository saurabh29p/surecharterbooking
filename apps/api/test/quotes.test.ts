import { findLeaks } from '@shubhjets/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { SEED_OWNER, seed } from '../src/db/seed-data.js';
import { OperatorsService } from '../src/operators/operators.service.js';
import { QuotesService } from '../src/quotes/quotes.service.js';
import { RatesService } from '../src/weddings/rates.service.js';
import { createTestApp, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

const NOW = new Date('2026-11-18T06:00:00Z');
const L = 1_00_000_00; // ₹1 lakh in paise
const HOUR = 3_600_000;

describe('quotes: builder, cancellation terms, issue, send, accept', () => {
  let t: TestApp;
  let token: string;
  let now: Date;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    await seed(t.ds, t.app.get(EncryptionService), NOW);
    now = NOW;
    t.app.get(RatesService).now = () => now;
    t.app.get(OperatorsService).now = () => now;
    t.app.get(QuotesService).now = () => now;
    token = (await t.http().post('/api/auth/login').send(SEED_OWNER)).body.accessToken;
    for (const r of await t.ds.query(
      `SELECT code AS k, id FROM wedding UNION ALL SELECT brand, id FROM operator`,
    ))
      ids[r.k] = r.id;
  });

  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);
  const legs = async (code: string) =>
    (await t.ds.query(
      `SELECT l.id, l.seq, l.status FROM leg l JOIN wedding w ON w.id = l.wedding_id WHERE w.code = $1 ORDER BY l.seq`,
      [code],
    )) as { id: string; seq: number; status: string }[];
  const rateOf = async (code: string, operator: string) =>
    (
      await t.ds.query(
        `SELECT r.id FROM rate_response r JOIN wedding w ON w.id = r.wedding_id
          JOIN operator o ON o.id = r.operator_id WHERE w.code = $1 AND o.brand = $2`,
        [code, operator],
      )
    )[0].id as string;
  /** W-102: choose a jet for each leg (both legs from one package rate by default). */
  const choose = async (operatorLeg1 = 'Operator A', operatorLeg2 = operatorLeg1) => {
    const [l1, l2] = await legs('W-102');
    for (const [leg, op] of [
      [l1!, operatorLeg1],
      [l2!, operatorLeg2],
    ] as const)
      await authed(t.http().put(`/api/legs/${leg.id}/choices`))
        .send({ rateResponseIds: [await rateOf('W-102', op)] })
        .expect(204);
  };
  const start = async () =>
    (await authed(t.http().post(`/api/weddings/${ids['W-102']}/quotes`)).expect(201)).body;
  const patch = (id: string, body: object) =>
    authed(t.http().patch(`/api/quotes/${id}`)).send(body);
  const issue = (id: string, confirmLooser = false) =>
    authed(t.http().post(`/api/quotes/${id}/issue`)).send({ confirmLooser });

  describe('the draft', () => {
    it('needs the jets chosen first', async () => {
      const res = await authed(t.http().post(`/api/weddings/${ids['W-102']}/quotes`)).expect(409);
      expect(res.body.message).toBe('Choose the jet for each leg on the Rates tab first.');
    });

    it('builds from the chosen jets with the default markup, GST and partner commission', async () => {
      await choose();
      const q = await start();
      expect(q).toMatchObject({ status: 'DRAFT', version: 1, reference: 'W-102 · Q1' });
      expect(q.legs.map((l: { lines: unknown[] }) => l.lines.length)).toEqual([1, 1]);
      expect(q.legs[0].lines[0]).toMatchObject({
        operator: { name: 'Operator A' },
        aircraft: 'Hawker 800XP VT-ZZ1',
        seats: 8,
        cost: 4.75 * L,
        markupType: 'PERCENT',
        markupValue: 1000,
        sell: 5.225 * L,
        margin: 47_500_00,
      });
      // Shared maths: ₹10,45,000 + 18% GST (CGST + SGST, client's state unknown) = ₹12,33,100.
      expect(q.totals).toMatchObject({
        cost: 9.5 * L,
        sellSubtotal: 10.45 * L,
        margin: 95_000_00,
        marginBps: 909,
        total: 12.331 * L,
        commission: 19_000_00, // Planner P1: 20% of our margin
      });
      expect(q.totals.gst).toMatchObject({ cgst: 94_050_00, sgst: 94_050_00, igst: 0 });
      expect(q.payment).toEqual([
        { bps: 10_000, amount: 12.331 * L, label: 'Full payment to confirm the booking' },
      ]);
      expect(q.inclusions).toBe('Fuel, crew, airport charges, catering for guests');
      expect(q.blockers).toEqual([]);
      expect(q.warnings).toEqual(
        expect.arrayContaining([
          'GST rate and SAC code are not yet confirmed by your CA.',
          "Client's state not known: GST is worked out as within your state (CGST + SGST).",
        ]),
      );
      // Opening it again returns the same draft.
      expect((await start()).id).toBe(q.id);
    });

    it('recomputes on the server when markups and extras change', async () => {
      await choose();
      const q = await start();
      const [l1] = await legs('W-102');
      const res = await patch(q.id, {
        lines: [
          {
            legId: l1!.id,
            rateResponseId: q.legs[0].lines[0].rateResponseId,
            markupType: 'FIXED',
            markupValue: 50_000_00,
          },
        ],
        extras: [{ description: 'Floral welcome on board', cost: 20_000_00, sell: 30_000_00 }],
        paymentPlanBps: [5000, 5000],
      }).expect(200);
      expect(res.body.legs[0].lines[0]).toMatchObject({ sell: 5.25 * L, margin: 50_000_00 });
      expect(res.body.extras).toEqual([
        expect.objectContaining({ description: 'Floral welcome on board', sell: 30_000_00 }),
      ]);
      expect(res.body.totals).toMatchObject({
        sellSubtotal: 5.25 * L + 5.225 * L + 30_000_00,
        margin: 50_000_00 + 47_500_00 + 10_000_00,
      });
      expect(res.body.payment.map((p: { label: string }) => p.label)).toEqual([
        '50% advance to confirm the booking',
        '50% balance before the first flight',
      ]);
    });

    it('explains bad input in plain words', async () => {
      await choose();
      const q = await start();
      const bad = await patch(q.id, {
        paymentPlanBps: [6000, 3000],
        validityHours: 0,
        cancellationSchedule: [{ minDays: 7, chargeBps: 1000 }],
        extras: [{ description: 'x', cost: 1, sell: 0 }],
      }).expect(400);
      expect(bad.body.fields).toMatchObject({
        paymentPlanBps: 'Instalments must add up to 100%',
        validityHours: 'At least 1 hour',
        cancellationSchedule: 'Add a line for cancellations close to departure (0 days)',
      });
    });

    it('follows the chosen jets while it is a draft, keeping each jet’s markup', async () => {
      await choose();
      const q = await start();
      const [l1, l2] = await legs('W-102');
      await patch(q.id, {
        lines: [
          {
            legId: l1!.id,
            rateResponseId: q.legs[0].lines[0].rateResponseId,
            markupType: 'PERCENT',
            markupValue: 1500,
          },
        ],
      }).expect(200);
      await authed(t.http().put(`/api/legs/${l2!.id}/choices`))
        .send({ rateResponseIds: [await rateOf('W-102', 'Operator B')] })
        .expect(204);
      const fresh = (await authed(t.http().get(`/api/quotes/${q.id}`)).expect(200)).body;
      expect(fresh.legs[0].lines[0]).toMatchObject({
        markupValue: 1500,
        operator: { name: 'Operator A' },
      });
      expect(fresh.legs[1].lines[0]).toMatchObject({
        markupValue: 1000,
        operator: { name: 'Operator B' },
        cost: 5.1 * L,
      });
    });
  });

  describe('cancellation terms', () => {
    it('shows each operator’s charges next to ours and finds where ours are looser', async () => {
      await choose();
      const q = await start();
      // Defaults: ours 30+ days 10%, 7–30 days 50%, under 7 days 100% vs Operator A 7+ 10%, 3–7 50%, under 3 100%.
      expect(q.cancellation.looser).toBe(false);
      expect(q.cancellation.operators[0]).toMatchObject({
        operator: { name: 'Operator A' },
        schedule: [
          { minDays: 7, chargeBps: 1000 },
          { minDays: 3, chargeBps: 5000 },
          { minDays: 0, chargeBps: 10000 },
        ],
        gaps: [],
      });
      const looser = await patch(q.id, {
        cancellationSchedule: [
          { minDays: 2, chargeBps: 0 },
          { minDays: 0, chargeBps: 10000 },
        ],
      }).expect(200);
      expect(looser.body.cancellation.looser).toBe(true);
      expect(looser.body.cancellation.operators[0].gapText).toEqual([
        '7 days or more before departure: Operator A keeps 10% but your terms keep only 0%.',
        '3 to 7 days before departure: Operator A keeps 50% but your terms keep only 0%.',
        '2 to 3 days before departure: Operator A keeps 100% but your terms keep only 0%.',
      ]);
      // The one-tap fix raises our charges only where needed (here: up to the operator's).
      expect(looser.body.cancellation.fix).toEqual([
        { minDays: 7, chargeBps: 1000 },
        { minDays: 3, chargeBps: 5000 },
        { minDays: 0, chargeBps: 10000 },
      ]);

      // Issuing with looser terms needs an explicit confirmation.
      const refused = await issue(q.id).expect(409);
      expect(refused.body).toMatchObject({
        code: 'LOOSER_TERMS',
        message: 'Your cancellation terms are looser than the operator’s.',
      });
      expect(refused.body.gaps).toHaveLength(3);
      await issue(q.id, true).expect(200);
    });

    it('records an operator’s charges from the quote screen, and as their usual terms', async () => {
      await choose('Operator B');
      await t.ds.query(`UPDATE rate_response SET cancellation_schedule = NULL`);
      const q = await start();
      expect(q.warnings).toContain(
        "Operator B's cancellation charges aren't recorded, so they can't be compared with yours.",
      );
      const rr = q.cancellation.operators[0].rateResponseId;
      const schedule = [
        { minDays: 0, chargeBps: 10000 },
        { minDays: 45, chargeBps: 2500 },
        { minDays: 7, chargeBps: 5000 },
      ];
      await authed(t.http().put(`/api/rate-responses/${rr}/cancellation-schedule`))
        .send({ schedule, saveForOperator: true })
        .expect(204);
      const fresh = (await authed(t.http().get(`/api/quotes/${q.id}`)).expect(200)).body;
      expect(fresh.cancellation.operators[0].schedule).toEqual([
        { minDays: 45, chargeBps: 2500 },
        { minDays: 7, chargeBps: 5000 },
        { minDays: 0, chargeBps: 10000 },
      ]);
      // Ours: 30+ days 10%, 7–30 days 50%, under 7 days 100%.
      expect(fresh.cancellation.operators[0].gapText).toEqual([
        '45 days or more before departure: Operator B keeps 25% but your terms keep only 10%.',
        '30 to 45 days before departure: Operator B keeps 50% but your terms keep only 10%.',
      ]);
      const [op] = await t.ds.query(
        `SELECT cancellation_schedule FROM operator WHERE brand = 'Operator B'`,
      );
      expect(op.cancellation_schedule).toHaveLength(3);
    });
  });

  describe('issuing', () => {
    it('freezes the quote, starts the validity clock and marks the legs and wedding quoted', async () => {
      await choose();
      const q = await start();
      const res = await issue(q.id).expect(200);
      expect(res.body).toMatchObject({ status: 'ISSUED', blockers: [], warnings: [] });
      expect(new Date(res.body.validUntil).getTime()).toBe(NOW.getTime() + 24 * HOUR);
      expect((await legs('W-102')).map((l) => l.status)).toEqual(['QUOTED', 'QUOTED']);
      const [w] = await t.ds.query(`SELECT status FROM wedding WHERE code = 'W-102'`);
      expect(w.status).toBe('QUOTED');
      await patch(q.id, { validityHours: 48 }).expect(409);
      await authed(t.http().delete(`/api/quotes/${q.id}`)).expect(409);
    });

    it('keeps internal figures out of the client-safe snapshot (rule 4)', async () => {
      await choose();
      const q = await start();
      await issue(q.id).expect(200);
      const [row] = await t.ds.query(`SELECT snapshot FROM quote WHERE id = $1`, [q.id]);
      const text = JSON.stringify(row.snapshot);
      for (const word of ['cost', 'margin', 'markup', 'commission', 'netRate', 'net_rate'])
        expect(text.toLowerCase()).not.toContain(word.toLowerCase());
      const svc = t.app.get(QuotesService);
      const figures = await svc.internalFigures(t.ds.manager, await svc.find(q.id));
      const shown = [
        row.snapshot.subtotal,
        row.snapshot.total,
        row.snapshot.gst.total,
        row.snapshot.gst.cgst,
        ...row.snapshot.legs.flatMap((l: { price: number; lines: { price: number }[] }) => [
          l.price,
          ...l.lines.map((x) => x.price),
        ]),
      ];
      const money = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`;
      expect(findLeaks(shown.map(money).join(' '), { ...figures, allowedAmounts: shown })).toEqual(
        [],
      );
      expect(row.snapshot.legs[0].lines[0]).toEqual({
        aircraft: 'Hawker 800XP',
        seats: 8,
        operator: 'Operator A',
        operatorPermit: expect.any(String),
        price: 5.225 * L,
      });
    });

    it('refuses an operator that can no longer be quoted (rule 1)', async () => {
      await choose();
      const q = await start();
      await authed(t.http().post(`/api/operators/${ids['Operator A']}/block`))
        .send({ reason: 'Safety review' })
        .expect(200);
      const res = await issue(q.id).expect(409);
      expect(res.body).toMatchObject({
        code: 'QUOTE_BLOCKED',
        message: "Operator A can't be quoted: Blocked by you",
      });
    });

    it('refuses an expired operator rate, and warns when a rate ends before the quote', async () => {
      await choose();
      const q = await start();
      await t.ds.query(`UPDATE rate_response SET valid_until = $1 WHERE id = $2`, [
        new Date(NOW.getTime() + 6 * HOUR),
        q.legs[0].lines[0].rateResponseId,
      ]);
      const warned = (await authed(t.http().get(`/api/quotes/${q.id}`)).expect(200)).body;
      expect(warned.warnings.join(' ')).toMatch(/Operator A's rate is only valid until/);
      now = new Date(NOW.getTime() + 7 * HOUR);
      const res = await issue(q.id).expect(409);
      expect(res.body.message).toMatch(/^Operator A's rate expired on .*: ask them to confirm it$/);
    });
  });

  describe('after issuing', () => {
    it('records sending and acceptance; an expired quote can’t be accepted', async () => {
      await choose();
      const q = await start();
      await issue(q.id).expect(200);
      const sent = await authed(t.http().post(`/api/quotes/${q.id}/sent`))
        .send({ channel: 'WHATSAPP' })
        .expect(200);
      expect(sent.body).toMatchObject({ status: 'SHARED', sharedAt: NOW.toISOString() });
      await authed(t.http().post(`/api/quotes/${q.id}/accept`))
        .send({ name: '' })
        .expect(400);

      now = new Date(NOW.getTime() + 25 * HOUR);
      const late = await authed(t.http().post(`/api/quotes/${q.id}/accept`))
        .send({ name: 'Client C2' })
        .expect(409);
      expect(late.body.message).toBe(
        'This quote has expired. Make a new version with fresh rates.',
      );
      const list = (await authed(t.http().get(`/api/weddings/${ids['W-102']}/quotes`)).expect(200))
        .body;
      expect(list[0]).toMatchObject({ reference: 'W-102 · Q1', status: 'EXPIRED' });
    });

    it('accepts a live quote', async () => {
      await choose();
      const q = await start();
      await issue(q.id).expect(200);
      const res = await authed(t.http().post(`/api/quotes/${q.id}/accept`))
        .send({ name: 'Client C2' })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'ACCEPTED', acceptedName: 'Client C2' });
    });

    it('a new version copies the last one; jets can change while it is drafted; issuing it replaces the old', async () => {
      await choose();
      const q1 = await start();
      const [l1, l2] = await legs('W-102');
      await patch(q1.id, {
        lines: [
          {
            legId: l1!.id,
            rateResponseId: q1.legs[0].lines[0].rateResponseId,
            markupType: 'PERCENT',
            markupValue: 1200,
          },
        ],
        extras: [{ description: 'Floral welcome on board', cost: 0, sell: 15_000_00 }],
      }).expect(200);
      await issue(q1.id).expect(200);

      // Quoted legs are locked until a new version is started.
      const locked = await authed(t.http().put(`/api/legs/${l2!.id}/choices`))
        .send({ rateResponseIds: [await rateOf('W-102', 'Operator B')] })
        .expect(409);
      expect(locked.body.message).toBe(
        'This leg is already on a quote; start a new quote version to change its jets',
      );

      const q2 = await start();
      expect(q2).toMatchObject({ version: 2, status: 'DRAFT' });
      expect(q2.legs[0].lines[0].markupValue).toBe(1200);
      expect(q2.extras).toEqual([
        expect.objectContaining({ description: 'Floral welcome on board' }),
      ]);
      await authed(t.http().put(`/api/legs/${l2!.id}/choices`))
        .send({ rateResponseIds: [await rateOf('W-102', 'Operator B')] })
        .expect(204);
      await issue(q2.id).expect(200);
      const list = (await authed(t.http().get(`/api/weddings/${ids['W-102']}/quotes`)).expect(200))
        .body;
      expect(list.map((x: { version: number; status: string }) => [x.version, x.status])).toEqual([
        [2, 'ISSUED'],
        [1, 'SUPERSEDED'],
      ]);
    });

    it('logs quote changes in the activity log', async () => {
      await choose();
      const q = await start();
      await issue(q.id).expect(200);
      const rows: { action: string }[] = await t.ds.query(
        `SELECT action FROM audit_log WHERE entity = 'quote' AND entity_id = $1 ORDER BY at`,
        [q.id],
      );
      expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(['CREATED', 'UPDATED']));
    });
  });
});
