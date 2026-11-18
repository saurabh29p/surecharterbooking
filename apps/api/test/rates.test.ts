import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { SEED_OWNER, seed } from '../src/db/seed-data.js';
import { OperatorsService } from '../src/operators/operators.service.js';
import { RatesService } from '../src/weddings/rates.service.js';
import { createTestApp, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

const NOW = new Date('2026-11-18T06:00:00Z');
const L = 1_00_000_00;

describe('rates: requests, replies, comparison and choice', () => {
  let t: TestApp;
  let token: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    await seed(t.ds, t.app.get(EncryptionService), NOW);
    t.app.get(RatesService).now = () => NOW;
    t.app.get(OperatorsService).now = () => NOW;
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
      `SELECT l.id, l.seq, l.pax FROM leg l JOIN wedding w ON w.id = l.wedding_id WHERE w.code = $1 ORDER BY l.seq`,
      [code],
    )) as {
      id: string;
      seq: number;
      pax: number;
    }[];
  const overview = async (code: string) =>
    (await authed(t.http().get(`/api/weddings/${ids[code]}/rates`)).expect(200)).body;
  const aircraft = async (reg: string) =>
    (await t.ds.query(`SELECT id FROM aircraft WHERE registration = $1`, [reg]))[0].id as string;

  describe('suggestions', () => {
    it('rank verified operators for a leg with reasons, leaving out unverified and too-small fleets', async () => {
      const [leg1] = await legs('W-102'); // DEL → JAI, 8 passengers, midsize
      const list = (await authed(t.http().get(`/api/legs/${leg1!.id}/suggestions`)).expect(200))
        .body;
      expect(list.map((s: { name: string }) => s.name)).toEqual(['Operator A', 'Operator B']); // C flies smaller aircraft; D is not verified
      expect(list[0]).toMatchObject({ jetsNeeded: 1, alreadyAsked: true });
      expect(list[0].reasons).toEqual(
        expect.arrayContaining([
          'Based at DEL (no positioning flight)',
          'Replies in ~2 h',
          'Usually 4% below others',
        ]),
      );
    });
  });

  describe('requests', () => {
    it('refuses operators that cannot be quoted (rule 1)', async () => {
      const res = await authed(t.http().post(`/api/weddings/${ids['W-101']}/rate-requests`))
        .send({ operatorIds: [ids['Operator D']] })
        .expect(409);
      expect(res.body.message).toBe("Operator D can't be quoted: Not verified yet");
    });

    it('records the request, drafts the message with a WhatsApp link, and moves the wedding on', async () => {
      const res = (
        await authed(t.http().post(`/api/weddings/${ids['W-101']}/rate-requests`))
          .send({ operatorIds: [ids['Operator A'], ids['Operator B']] })
          .expect(201)
      ).body;
      expect(res).toHaveLength(2);
      expect(res[0].message).toContain(
        'Rate request from ShubhJets for a wedding in Udaipur (ref W-101):',
      );
      expect(res[0].message).toContain('• Leg 1: New Delhi (DEL) → Udaipur (UDR)');
      expect(res[0].whatsappUrl).toMatch(
        /^https:\/\/wa\.me\/9192222222\d+\?text=Hello%20Operator%20A/,
      );
      expect(res[0].mailtoUrl).toMatch(
        /^mailto:ops@operator-a\.example\.test\?subject=Rate%20request%20W-101/,
      );
      const w = (await authed(t.http().get(`/api/weddings/${ids['W-101']}`))).body;
      expect(w.status).toBe('RATES_REQUESTED');
      expect(w.legs.map((l: { status: string }) => l.status)).toEqual([
        'RATES_REQUESTED',
        'RATES_REQUESTED',
      ]);
      const again = (
        await authed(t.http().get(`/api/rate-requests/${res[1].requestId}/message`)).expect(200)
      ).body;
      expect(again.message).toContain('Hello Operator B team,');
    });
  });

  describe('overview', () => {
    it('shows who replied, who is overdue, and compares each leg cheapest first', async () => {
      const o = await overview('W-102');
      expect(o.summary).toEqual({ asked: 4, replied: 2, overdue: 2, legsChosen: 0, legs: 2 });
      expect(
        o.requests
          .filter((r: { overdue: boolean }) => r.overdue)
          .map((r: { operator: { name: string } }) => r.operator.name)
          .sort(),
      ).toEqual(['Operator C', 'Operator D']);
      const leg1 = o.comparison[0];
      expect(
        leg1.rows.map(
          (r: {
            operator: { name: string };
            cost: number;
            perSeat: number;
            isPackage: boolean;
          }) => [r.operator.name, r.cost, r.perSeat, r.isPackage],
        ),
      ).toEqual([
        ['Operator A', 4.75 * L, 59_375_00, true],
        ['Operator B', 5.1 * L, 63_750_00, true],
      ]);
      expect(leg1.cheapestId).toBe(leg1.rows[0].responseId);
      expect(o.replies[0]).toMatchObject({
        operator: { name: 'Operator A' },
        replyHours: 2,
        expired: false,
        quotable: { ok: true },
      });
    });
  });

  describe('replies', () => {
    it('records a package rate split across the legs it covers, from their fleet', async () => {
      const [l1, l2] = await legs('W-101');
      await authed(t.http().post(`/api/weddings/${ids['W-101']}/rate-requests`))
        .send({ operatorIds: [ids['Operator A']] })
        .expect(201);
      const { body } = await authed(t.http().post(`/api/weddings/${ids['W-101']}/rate-responses`))
        .send({
          operatorId: ids['Operator A'],
          aircraftId: await aircraft('VT-ZZ2'),
          netRate: 30 * L + 1,
          legIds: [l1!.id, l2!.id],
          inclusions: 'Fuel, crew, catering',
          validUntil: '2026-11-20T12:00:00Z',
        })
        .expect(201);
      const o = await overview('W-101');
      const reply = o.replies.find((r: { id: string }) => r.id === body.id);
      expect(reply).toMatchObject({
        aircraft: 'Legacy 600 VT-ZZ2',
        seats: 13,
        isPackage: true,
        legs: [{ costShare: 15 * L + 1 }, { costShare: 15 * L }],
      });
      expect(o.comparison.map((c: { status: string }) => c.status)).toEqual([
        'RATES_IN',
        'RATES_IN',
      ]);
    });

    it('explains bad replies: aircraft from another operator, shares that do not add up', async () => {
      const [l1, l2] = await legs('W-101');
      const res = await authed(t.http().post(`/api/weddings/${ids['W-101']}/rate-responses`))
        .send({
          operatorId: ids['Operator A'],
          aircraftId: await aircraft('VT-ZZ3'),
          netRate: 10 * L,
          legIds: [l1!.id, l2!.id],
          costShares: [5 * L, 4 * L],
        })
        .expect(400);
      expect(res.body.fields).toEqual({
        aircraftId: "Choose one of this operator's aircraft",
        costShares: 'The leg amounts must add up to the net rate',
      });
    });

    it('keeps rates that are already on a quote', async () => {
      const [r] = await t.ds.query(
        `SELECT rate_response_id AS id FROM quote_line WHERE rate_response_id IS NOT NULL LIMIT 1`,
      );
      await authed(t.http().delete(`/api/rate-responses/${r.id}`)).expect(409);
      await authed(t.http().patch(`/api/rate-responses/${r.id}`))
        .send({ netRate: 1 })
        .expect(409);
      await authed(t.http().patch(`/api/rate-responses/${r.id}`))
        .send({ inclusions: 'Updated note' })
        .expect(204);
    });
  });

  describe('choosing the jet', () => {
    it('chooses the cheapest, and moves the leg to "jet chosen"; deleting the reply clears it', async () => {
      const o = await overview('W-102');
      const leg = o.comparison[0];
      await authed(t.http().put(`/api/legs/${leg.legId}/choices`))
        .send({ rateResponseIds: [leg.cheapestId] })
        .expect(204);
      const after = await overview('W-102');
      expect(after.comparison[0]).toMatchObject({
        status: 'CHOSEN',
        chosenSeats: 8,
        chosenCost: 4.75 * L,
      });
      expect(after.summary.legsChosen).toBe(1);
      await authed(t.http().delete(`/api/rate-responses/${leg.cheapestId}`)).expect(204);
      expect((await overview('W-102')).comparison[0].status).toBe('RATES_IN');
    });

    it('refuses an operator blocked since the reply came in (rule 1)', async () => {
      const leg = (await overview('W-102')).comparison[0];
      await authed(t.http().post(`/api/operators/${ids['Operator A']}/block`))
        .send({ reason: 'Safety review' })
        .expect(200);
      const res = await authed(t.http().put(`/api/legs/${leg.legId}/choices`))
        .send({ rateResponseIds: [leg.rows[0].responseId] })
        .expect(409);
      expect(res.body.message).toBe("Operator A can't be quoted: Blocked by you");
      const o = await overview('W-102');
      expect(o.comparison[0].rows[0].quotable).toEqual({ ok: false, reason: 'Blocked by you' });
      expect(o.comparison[0].cheapestId).toBe(o.comparison[0].rows[1].responseId); // cheapest usable
    });

    it('refuses an expired rate', async () => {
      const leg = (await overview('W-102')).comparison[0];
      await t.ds.query(`UPDATE rate_response SET valid_until = $1 WHERE id = $2`, [
        new Date(NOW.getTime() - 3_600_000),
        leg.rows[0].responseId,
      ]);
      const res = await authed(t.http().put(`/api/legs/${leg.legId}/choices`))
        .send({ rateResponseIds: [leg.rows[0].responseId] })
        .expect(409);
      expect(res.body.message).toMatch(/rate expired on 18 Nov 2026, 10:30 am IST/);
    });

    it('needs enough seats: one jet for 18 guests is refused, two jets are fine', async () => {
      const [l1] = await legs('W-101');
      await authed(t.http().patch(`/api/legs/${l1!.id}`))
        .send({ pax: 18 })
        .expect(200);
      const add = async (reg: string, net: number) =>
        (
          await authed(t.http().post(`/api/weddings/${ids['W-101']}/rate-responses`))
            .send({
              operatorId: ids['Operator B'],
              aircraftId: await aircraft(reg),
              netRate: net,
              legIds: [l1!.id],
            })
            .expect(201)
        ).body.id as string;
      const big = await add('VT-ZZ4', 7 * L); // 10 seats
      const small = await add('VT-ZZ3', 6 * L); // 8 seats
      const one = await authed(t.http().put(`/api/legs/${l1!.id}/choices`))
        .send({ rateResponseIds: [big] })
        .expect(409);
      expect(one.body.message).toBe(
        'The chosen jet seats 10; this leg has 18 passengers. Add another jet.',
      );
      await authed(t.http().put(`/api/legs/${l1!.id}/choices`))
        .send({ rateResponseIds: [big, small] })
        .expect(204);
      expect((await overview('W-101')).comparison[0]).toMatchObject({
        chosenSeats: 18,
        chosenCost: 13 * L,
      });
      // More guests later: the choice no longer seats everyone and is cleared.
      await authed(t.http().patch(`/api/legs/${l1!.id}`))
        .send({ pax: 20 })
        .expect(200);
      expect((await overview('W-101')).comparison[0]).toMatchObject({
        status: 'RATES_IN',
        chosenSeats: 0,
      });
    });

    it('logs choices in the activity log', async () => {
      const leg = (await overview('W-102')).comparison[0];
      await authed(t.http().put(`/api/legs/${leg.legId}/choices`))
        .send({ rateResponseIds: [leg.cheapestId] })
        .expect(204);
      const [row] = await t.ds.query(
        `SELECT action, diff FROM audit_log WHERE action = 'CHOICE_SET'`,
      );
      expect(row.diff).toEqual({ from: [], to: [leg.cheapestId] });
    });
  });
});
