import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { SEED_OWNER, seed } from '../src/db/seed-data.js';
import { AgreementsService } from '../src/documents/agreements.service.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { TemplatesService } from '../src/documents/templates.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { QuotesService } from '../src/quotes/quotes.service.js';
import { createTestApp, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';
import { PDF } from './fixtures.js';

const NOW = new Date('2026-11-18T06:00:00Z');
const DAY = 86_400_000;
const L = 1_00_000_00;

describe('payments: confirmation (rule 2), payouts (rule 3), flights', () => {
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
    for (const svc of [
      PaymentsService,
      QuotesService,
      TemplatesService,
      AgreementsService,
      DocumentsService,
    ])
      (t.app.get(svc) as { now: () => Date }).now = () => now;
    token = (await t.http().post('/api/auth/login').send(SEED_OWNER)).body.accessToken;
    for (const r of await t.ds.query(
      `SELECT code AS k, id FROM wedding UNION ALL SELECT brand, id FROM operator UNION ALL SELECT firm, id FROM partner`,
    ))
      ids[r.k] = r.id;
  });

  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);
  const money = async (code: string) =>
    (await authed(t.http().get(`/api/weddings/${ids[code]}/money`)).expect(200)).body;
  const pay = (code: string, body: object) =>
    authed(t.http().post(`/api/weddings/${ids[code]}/payments`)).send(body);
  const weddingStatus = async (code: string) =>
    (await t.ds.query(`SELECT status FROM wedding WHERE code = $1`, [code]))[0].status as string;
  const legs = async (code: string) =>
    (await t.ds.query(
      `SELECT l.id, l.status FROM leg l JOIN wedding w ON w.id = l.wedding_id WHERE w.code = $1 ORDER BY l.seq`,
      [code],
    )) as { id: string; status: string }[];

  /** W-103: accept its shared quote, then sign the client terms (approved template). */
  async function acceptW103() {
    const [q] = await t.ds.query(`SELECT id FROM quote WHERE wedding_id = $1`, [ids['W-103']]);
    await authed(t.http().post(`/api/quotes/${q.id}/accept`))
      .send({ name: 'Client C3' })
      .expect(200);
  }
  async function signTerms(code: string) {
    const tpl = (await authed(t.http().get('/api/templates/client-terms')).expect(200)).body;
    if (!tpl.current.lawyerApproved)
      await authed(t.http().post(`/api/templates/client-terms/versions/${tpl.current.id}/approve`))
        .send({ approvedOn: '2026-11-17' })
        .expect(200);
    const doc = (
      await authed(t.http().post('/api/agreements'))
        .send({ kind: 'CLIENT_TERMS', weddingId: ids[code] })
        .expect(201)
    ).body;
    await authed(t.http().post(`/api/documents/${doc.documentId}/signed`))
      .attach('file', PDF, 's.pdf')
      .expect(204);
  }

  describe('client payments', () => {
    it('need an accepted quote, a date in the past, and no more than the balance', async () => {
      const early = await pay('W-103', {
        direction: 'CLIENT_IN',
        amount: 1 * L,
        paidOn: '2026-11-17',
      }).expect(409);
      expect(early.body.message).toBe('Record the client’s acceptance on the Quote tab first.');
      await acceptW103();
      const m = await money('W-103');
      const future = await pay('W-103', {
        direction: 'CLIENT_IN',
        amount: 1 * L,
        paidOn: '2026-11-19',
      }).expect(400);
      expect(future.body.fields.paidOn).toBe('The date cannot be in the future');
      const over = await pay('W-103', {
        direction: 'CLIENT_IN',
        amount: m.position.total + 100,
        paidOn: '2026-11-17',
      }).expect(400);
      expect(over.body.fields.amount).toMatch(/^That's more than the balance of ₹/);
      await pay('W-103', {
        direction: 'CLIENT_IN',
        amount: 5 * L,
        paidOn: '2026-11-17',
        mode: 'UPI',
        reference: 'UTR123',
      }).expect(201);
      const after = await money('W-103');
      expect(after.position).toMatchObject({ received: 5 * L, balance: m.position.total - 5 * L });
      expect(after.payments[0]).toMatchObject({
        direction: 'CLIENT_IN',
        mode: 'UPI',
        reference: 'UTR123',
      });
    });
  });

  describe('rule 2: confirming a wedding', () => {
    it('needs signed client terms and the required payment; nothing else can confirm it', async () => {
      await acceptW103();
      const before = await authed(t.http().post(`/api/weddings/${ids['W-103']}/confirm`)).expect(
        409,
      );
      expect(before.body).toMatchObject({ code: 'NOT_READY', missing: ['terms', 'payment'] });
      expect(before.body.message).toMatch(/Upload the signed client terms on the Docs tab/);

      // Editing the wedding can never confirm it (status is not an editable field).
      await authed(t.http().patch(`/api/weddings/${ids['W-103']}`)).send({
        status: 'SIGNED_AND_PAID',
      });
      expect(await weddingStatus('W-103')).toBe('QUOTED');

      await signTerms('W-103');
      const m = await money('W-103');
      await pay('W-103', {
        direction: 'CLIENT_IN',
        amount: m.position.total - 1000,
        paidOn: '2026-11-17',
      }).expect(201);
      const short = await authed(t.http().post(`/api/weddings/${ids['W-103']}/confirm`)).expect(
        409,
      );
      expect(short.body.missing).toEqual(['payment']);
      expect(short.body.message).toBe('Not yet: ₹10 more to receive.');

      await pay('W-103', { direction: 'CLIENT_IN', amount: 1000, paidOn: '2026-11-18' }).expect(
        201,
      );
      expect((await money('W-103')).canConfirm).toBe(true);
      await authed(t.http().post(`/api/weddings/${ids['W-103']}/confirm`)).expect(204);
      expect(await weddingStatus('W-103')).toBe('SIGNED_AND_PAID');
      expect((await legs('W-103')).map((l) => l.status)).toEqual(['CONFIRMED', 'CONFIRMED']);
      await authed(t.http().post(`/api/weddings/${ids['W-103']}/confirm`)).expect(409);
    });

    it('respects a wedding’s own required share (e.g. a 50% advance)', async () => {
      await acceptW103();
      await t.ds.query(`UPDATE wedding SET required_payment_bps = 5000 WHERE code = 'W-103'`);
      await signTerms('W-103');
      const m = await money('W-103');
      await pay('W-103', {
        direction: 'CLIENT_IN',
        amount: m.position.required,
        paidOn: '2026-11-17',
      }).expect(201);
      await authed(t.http().post(`/api/weddings/${ids['W-103']}/confirm`)).expect(204);
    });

    it('keeps a confirmed wedding’s required payment: it cannot be removed', async () => {
      const m = await money('W-104');
      const client = m.payments.find((p: { direction: string }) => p.direction === 'CLIENT_IN');
      const res = await authed(t.http().delete(`/api/payments/${client.id}`)).expect(409);
      expect(res.body.message).toBe(
        'This wedding is confirmed with this payment. It cannot be removed.',
      );
    });
  });

  describe('rule 3: payouts only from client money received', () => {
    it('allows an operator payout the money covers, and explains when it does not', async () => {
      const m = await money('W-104');
      expect(m.operators).toEqual([
        expect.objectContaining({ name: 'Operator A', owedNet: 9 * L, remainingNet: 9 * L }),
      ]);
      await pay('W-104', {
        direction: 'OPERATOR_OUT',
        operatorId: ids['Operator A'],
        amount: 9 * L,
        gstAmount: 45_000_00,
      }).expect(201);
      const after = await money('W-104');
      expect(after.operators[0]).toMatchObject({ committedNet: 9 * L, remainingNet: 0 });
      expect(after.position.operatorCommitted).toBe(9.45 * L);

      const tooMuch = await pay('W-104', {
        direction: 'OPERATOR_OUT',
        operatorId: ids['Operator A'],
        amount: after.position.uncommitted + 100,
      }).expect(409);
      expect(tooMuch.body.code).toBe('PAYOUT_NOT_COVERED');
      expect(tooMuch.body.message).toMatch(
        /^Client money received covers ₹[\d,]+ more in payouts; ₹1 more must come in from the client first$/,
      );
      const notOnQuote = await pay('W-104', {
        direction: 'OPERATOR_OUT',
        operatorId: ids['Operator B'],
        amount: 1 * L,
      }).expect(409);
      expect(notOnQuote.body.message).toBe('That operator is not on the accepted quote.');
    });

    it('blocks payouts before any client money arrives', async () => {
      await acceptW103();
      const res = await pay('W-103', {
        direction: 'OPERATOR_OUT',
        operatorId: ids['Operator B'],
        amount: 1 * L,
      }).expect(409);
      expect(res.body.message).toBe(
        'Client money received covers ₹0 more in payouts; ₹1,00,000 more must come in from the client first',
      );
    });

    it('keeps client money that payouts rely on; a removed payout can be restored', async () => {
      const m = await money('W-104');
      const client = m.payments.find((p: { direction: string }) => p.direction === 'CLIENT_IN');
      const op = await pay('W-104', {
        direction: 'OPERATOR_OUT',
        operatorId: ids['Operator A'],
        amount: 9 * L,
      }).expect(201);
      // (Confirmed weddings refuse anyway; check the payout reason on an unconfirmed one too.)
      await t.ds.query(`UPDATE wedding SET status = 'QUOTED' WHERE code = 'W-104'`);
      const res = await authed(t.http().delete(`/api/payments/${client.id}`)).expect(409);
      expect(res.body.message).toMatch(/rely on this money/);
      await authed(t.http().delete(`/api/payments/${op.body.id}`)).expect(204);
      expect((await money('W-104')).position.operatorCommitted).toBe(0);
      await authed(t.http().post(`/api/payments/${op.body.id}/restore`)).expect(204);
      expect((await money('W-104')).position.operatorCommitted).toBe(9 * L);
    });

    it('makes partner commission payable only after the wedding has flown', async () => {
      const m = await money('W-104');
      expect(m.partner).toMatchObject({ name: 'Planner P1', flown: false });
      const early = await pay('W-104', {
        direction: 'PARTNER_OUT',
        partnerId: ids['Planner P1'],
        amount: m.partner.owed,
      }).expect(409);
      expect(early.body.message).toBe(
        'Commission is earned only after the client has paid and the wedding has flown',
      );

      // The flights happen.
      const [l1, l2] = await legs('W-104');
      await authed(t.http().post(`/api/legs/${l1!.id}/flown`)).expect(409); // in the future
      now = new Date(NOW.getTime() + 8 * DAY);
      await authed(t.http().post(`/api/legs/${l1!.id}/flown`)).expect(204);
      expect(await weddingStatus('W-104')).toBe('FLYING');
      await authed(t.http().post(`/api/legs/${l2!.id}/flown`)).expect(204);
      expect(await weddingStatus('W-104')).toBe('DONE');

      const c = await pay('W-104', {
        direction: 'PARTNER_OUT',
        partnerId: ids['Planner P1'],
        amount: m.partner.owed,
        tdsBps: 500,
      }).expect(201);
      await authed(t.http().post(`/api/payments/${c.body.id}/paid`))
        .send({ paidOn: '2026-11-25', reference: 'UTR-P1' })
        .expect(204);
      const done = await money('W-104');
      expect(done.payments[0]).toMatchObject({
        status: 'PAID',
        tdsBps: 500,
        tds: Math.round(m.partner.owed * 0.05),
      });
      expect(done.partner).toMatchObject({ remaining: 0, flown: true });
      // Undoing "flown" is refused once commission depends on it.
      await authed(t.http().delete(`/api/legs/${l2!.id}/flown`)).expect(409);
    });
  });

  it('logs every payment change in the activity log', async () => {
    const r = await pay('W-104', {
      direction: 'OPERATOR_OUT',
      operatorId: ids['Operator A'],
      amount: 1 * L,
    }).expect(201);
    await authed(t.http().post(`/api/payments/${r.body.id}/paid`))
      .send({ paidOn: '2026-11-18' })
      .expect(204);
    await authed(t.http().delete(`/api/payments/${r.body.id}`)).expect(204);
    const rows = await t.ds.query(
      `SELECT action FROM audit_log WHERE entity = 'payment' AND entity_id = $1 ORDER BY at`,
      [r.body.id],
    );
    expect(rows.map((x: { action: string }) => x.action)).toEqual([
      'CREATED',
      'UPDATED',
      'UPDATED',
    ]);
  });
});
