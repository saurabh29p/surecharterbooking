import { findLeaks } from '@shubhjets/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { SEED_OWNER, seed } from '../src/db/seed-data.js';
import { QuotesService } from '../src/quotes/quotes.service.js';
import { OperatorsService } from '../src/operators/operators.service.js';
import { PartnersService } from '../src/partners/partners.service.js';
import { TodayService } from '../src/today/today.service.js';
import { ConsentService } from '../src/clients/consent.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { EnquiriesService } from '../src/enquiries/enquiries.service.js';
import { PrivacyService } from '../src/privacy/privacy.service.js';
import { RatesService } from '../src/weddings/rates.service.js';
import { GuestsService } from '../src/guests/guests.service.js';
import { AgreementsService } from '../src/documents/agreements.service.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { TemplatesService } from '../src/documents/templates.service.js';
import { SharingService } from '../src/sharing/sharing.service.js';
import { InvoicesService } from '../src/invoices/invoices.service.js';
import { createTestApp, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';
import { PDF, PNG } from './fixtures.js';

/** 10:00 am IST, 18 Nov 2026. */
const START = new Date('2026-11-18T04:30:00Z');
const L = 1_00_000_00; // ₹1 lakh in paise
const CLOCKED = [
  QuotesService,
  OperatorsService,
  PartnersService,
  TodayService,
  ConsentService,
  PaymentsService,
  EnquiriesService,
  PrivacyService,
  RatesService,
  GuestsService,
  AgreementsService,
  DocumentsService,
  TemplatesService,
  SharingService,
  InvoicesService,
];

/**
 * BRIEF.md §7: the full flow through the real API, as the owner would do it on the phone:
 * website enquiry → rates → quote → link acceptance → signed terms and payment → confirmed →
 * guest IDs → payout → flying → done → GST invoice → DPDP erase. Today is checked along the way.
 */
describe('end to end: a website enquiry becomes a flown wedding', () => {
  let t: TestApp;
  let token: string;
  let now = START;
  const at = (iso: string) => (now = new Date(iso));

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.ds);
    resetLimits(t);
    await seed(t.ds, t.app.get(EncryptionService), START);
    // Every service that reads the clock follows this test's clock.
    for (const svc of CLOCKED) (t.app.get(svc) as { now: () => Date }).now = () => now;
    token = (await t.http().post('/api/auth/login').send(SEED_OWNER).expect(200)).body.accessToken;
  });
  afterAll(() => t.close());

  const api = {
    get: (path: string) => t.http().get(`/api${path}`).set('authorization', `Bearer ${token}`),
    post: (path: string, body: object = {}) =>
      t.http().post(`/api${path}`).set('authorization', `Bearer ${token}`).send(body),
    put: (path: string, body: object) =>
      t.http().put(`/api${path}`).set('authorization', `Bearer ${token}`).send(body),
    patch: (path: string, body: object) =>
      t.http().patch(`/api${path}`).set('authorization', `Bearer ${token}`).send(body),
  };
  const today = async () => (await api.get('/today').expect(200)).body;
  const actionsFor = async (code: string) =>
    ((await today()).actions as { kind: string; title: string }[]).filter((a) =>
      a.title.startsWith(code),
    );
  const statusOf = async (id: string) =>
    (await t.ds.query(`SELECT status FROM wedding WHERE id = $1`, [id]))[0].status as string;

  let weddingId: string;
  let code: string;
  let clientId: string;
  let legIds: string[];
  let quote: { id: string; documentId: string };
  let netRate: number;

  it('1. the website enquiry lands as a wedding with a draft leg, and on Today', async () => {
    await t
      .http()
      .post('/api/public/enquiries')
      .set('origin', 'http://localhost:4321')
      .send({
        name: 'Test Family E2E',
        phone: '98100 55555',
        email: 'e2e@example.test',
        role: 'family',
        weddingCity: 'Udaipur',
        weddingDate: '2026-12-20',
        guestsFrom: '6 from Delhi',
        message: 'Sangeet on the 19th evening',
        consent: true,
        page: '/routes/delhi-to-udaipur',
        utmSource: 'google',
        utmMedium: 'cpc',
        gclid: 'e2e-click',
        elapsedMs: 25_000,
      })
      .expect(201);
    const [w] = await t.ds.query(
      `SELECT id, code, client_id, lead_source, status FROM wedding ORDER BY number DESC LIMIT 1`,
    );
    ({ id: weddingId, code, client_id: clientId } = w);
    expect(w).toMatchObject({ lead_source: 'GOOGLE_ADS', status: 'ENQUIRY' });

    // The family's return flight, added on the first call.
    await api
      .post(`/weddings/${weddingId}/legs`, { from: 'UDR', to: 'DEL', date: '2026-12-21', pax: 6 })
      .expect(201);
    legIds = (
      await t.ds.query(`SELECT id FROM leg WHERE wedding_id = $1 ORDER BY seq`, [weddingId])
    ).map((r: { id: string }) => r.id);
    expect(legIds).toHaveLength(2);

    expect((await actionsFor(code)).map((a) => a.kind)).toEqual(['NEW_ENQUIRY']);
  });

  it('2. rates are requested from verified operators, a reply comes in, a jet is chosen', async () => {
    const [opA] = await t.ds.query(`SELECT id FROM operator WHERE brand = 'Operator A'`);
    const [jet] = await t.ds.query(
      `SELECT id FROM aircraft WHERE operator_id = $1 AND seats >= 6 ORDER BY seats LIMIT 1`,
      [opA.id],
    );
    await api.post(`/weddings/${weddingId}/rate-requests`, { operatorIds: [opA.id] }).expect(201);
    expect(await statusOf(weddingId)).toBe('RATES_REQUESTED');

    netRate = 8 * L;
    const reply = (
      await api
        .post(`/weddings/${weddingId}/rate-responses`, {
          operatorId: opA.id,
          aircraftId: jet.id,
          netRate,
          legIds,
          inclusions: 'Fuel, crew, catering',
          validUntil: '2026-11-25T12:00:00Z',
        })
        .expect(201)
    ).body;
    for (const leg of legIds)
      await api.put(`/legs/${leg}/choices`, { rateResponseIds: [reply.id] }).expect(204);
    expect((await actionsFor(code)).map((a) => a.kind)).toEqual(['BUILD_QUOTE']);
  });

  it('3. the quote is built, issued as a branded PDF and shared by secure link', async () => {
    const draft = (await api.post(`/weddings/${weddingId}/quotes`).expect(201)).body;
    const issued = (await api.post(`/quotes/${draft.id}/issue`).expect(200)).body;
    quote = { id: draft.id, documentId: issued.documentId };
    expect(await statusOf(weddingId)).toBe('QUOTED');

    const link = (
      await api
        .post(`/documents/${quote.documentId}/share-links`, {
          channel: 'WHATSAPP',
          recipient: 'Test Family E2E',
          phone: '+919810055555',
          message: 'Namaste, your quote: {link}',
        })
        .expect(201)
    ).body;
    const tk = link.url.split('/s/')[1];

    // Rule 4: the client's page never shows our cost or margin.
    const page = await t.http().get(`/api/s/${tk}`).expect(200);
    const [q] = await t.ds.query(`SELECT totals FROM quote WHERE id = $1`, [quote.id]);
    expect(q.totals.cost).toBe(netRate);
    // What the client reads (the page's own CSS has words like "margin:" in it).
    const visible = page.text.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
    expect(visible).toContain('Udaipur');
    const leaks = findLeaks(visible, { amounts: [q.totals.cost, q.totals.margin], percents: [] });
    expect(leaks).toEqual([]);

    // The client accepts on the link; Today puts it first.
    await t
      .http()
      .post(`/api/s/${tk}/accept`)
      .type('form')
      .send({ name: 'Test Family E2E', agree: 'yes' })
      .expect(303);
    const [first] = (await today()).actions;
    expect(first).toMatchObject({
      kind: 'ACCEPTANCE',
      title: `${code}: Test Family E2E accepted the quote on the link`,
    });
  });

  it('4. acceptance confirmed; terms signed and payment in (rule 2), the wedding is confirmed', async () => {
    await api.post(`/quotes/${quote.id}/accept`, { name: 'Test Family E2E' }).expect(200);
    expect((await actionsFor(code)).map((a) => a.kind).sort()).toEqual([
      'CONFIRM_STEP',
      'PAYMENT_DUE',
    ]);
    await api.post(`/weddings/${weddingId}/confirm`).expect(409);

    // Charter terms from the lawyer-approved template; the client's billing address first.
    await api
      .patch(`/clients/${clientId}`, { address: '12 Example Road, New Delhi 110001' })
      .expect(200);
    const tpl = (await api.get('/templates/client-terms').expect(200)).body;
    if (!tpl.current.lawyerApproved)
      await api
        .post(`/templates/client-terms/versions/${tpl.current.id}/approve`, {
          approvedOn: '2026-11-18',
        })
        .expect(200);
    const terms = (await api.post('/agreements', { kind: 'CLIENT_TERMS', weddingId }).expect(201))
      .body;
    await t
      .http()
      .post(`/api/documents/${terms.documentId}/signed`)
      .set('authorization', `Bearer ${token}`)
      .attach('file', PDF, 'signed-terms.pdf')
      .expect(204);

    const money = (await api.get(`/weddings/${weddingId}/money`).expect(200)).body;
    await api
      .post(`/weddings/${weddingId}/payments`, {
        direction: 'CLIENT_IN',
        amount: money.position.required,
        paidOn: '2026-11-18',
        mode: 'BANK_TRANSFER',
        reference: 'UTR-E2E-1',
      })
      .expect(201);
    expect((await actionsFor(code)).map((a) => a.kind)).toEqual(['CONFIRM']);

    const before = (await today()).tracker.month;
    await api.post(`/weddings/${weddingId}/confirm`).expect(204);
    expect(await statusOf(weddingId)).toBe('SIGNED_AND_PAID');
    const after = (await today()).tracker.month;
    const [q] = await t.ds.query(`SELECT totals FROM quote WHERE id = $1`, [quote.id]);
    // A direct client (no partner): you keep the whole margin.
    expect(after.weddingsConfirmed).toBe(before.weddingsConfirmed + 1);
    expect(after.keep - before.keep).toBe(q.totals.margin);
  });

  it('5. guests and their IDs are in; the operator is paid from client money (rule 3)', async () => {
    for (const leg of legIds) {
      await api
        .post(`/legs/${leg}/guests`, {
          text: 'Asha E2E\nRohan E2E\nMeera E2E\nKabir E2E\nTara E2E\nDev E2E',
        })
        .expect(201);
    }
    const guests: { id: string }[] = await t.ds.query(
      `SELECT g.id FROM guest g WHERE g.leg_id = ANY($1)`,
      [legIds],
    );
    expect(guests).toHaveLength(12);
    for (const g of guests)
      await t
        .http()
        .post(`/api/guests/${g.id}/id-document`)
        .set('authorization', `Bearer ${token}`)
        .attach('file', PNG, 'id.png')
        .expect(204);
    // 25 days later, 6 days before flying: no IDs missing, so nothing about guests on Today.
    at('2026-12-13T04:30:00Z');
    expect((await actionsFor(code)).map((a) => a.kind)).not.toContain('GUEST_IDS');

    const money = (await api.get(`/weddings/${weddingId}/money`).expect(200)).body;
    const [opA] = await t.ds.query(`SELECT id FROM operator WHERE brand = 'Operator A'`);
    await api
      .post(`/weddings/${weddingId}/payments`, {
        direction: 'OPERATOR_OUT',
        operatorId: opA.id,
        amount: money.operators[0].owedNet,
        gstAmount: 0,
      })
      .expect(201);
    // Made payable now; Today reminds until it is recorded as paid.
    const payout = (await api.get(`/weddings/${weddingId}/money`).expect(200)).body.payments.find(
      (p: { direction: string }) => p.direction === 'OPERATOR_OUT',
    );
    expect((await actionsFor(code)).map((a) => a.kind)).toContain('PAY_OPERATOR');
    await api
      .post(`/payments/${payout.id}/paid`, { paidOn: '2026-12-13', reference: 'UTR-OP-1' })
      .expect(204);
    expect((await actionsFor(code)).map((a) => a.kind)).not.toContain('PAY_OPERATOR');
  });

  it('6. the flights happen: Flying, then Done', async () => {
    at('2026-12-19T12:30:00Z');
    await api.post(`/legs/${legIds[0]}/flown`).expect(204);
    expect(await statusOf(weddingId)).toBe('FLYING');
    at('2026-12-22T04:30:00Z');
    const flown = (await actionsFor(code)).find((a) => a.kind === 'MARK_FLOWN');
    expect(flown?.title).toBe(`${code}: did leg 2 fly?`);
    await api.post(`/legs/${legIds[1]}/flown`).expect(204);
    expect(await statusOf(weddingId)).toBe('DONE');
  });

  it('7. the GST invoice is issued once the CA has confirmed GST', async () => {
    const blocked = (await api.get(`/weddings/${weddingId}/invoices`).expect(200)).body;
    expect(blocked.blockers).toEqual([
      'Your CA has not confirmed the GST rate and SAC code yet (Settings → Rules)',
    ]);
    await api.patch('/settings', { values: { 'gst.sac': '996412' }, confirmGst: true }).expect(200);
    const inv = (await api.post(`/weddings/${weddingId}/invoices`).expect(201)).body;
    expect(inv.number).toMatch(/^SJ\/2026-27\/\d{4}$/);
    expect(await actionsFor(code)).toEqual([]);
  });

  it('8. later the family asks to be forgotten: erased, keeping the invoice the law needs', async () => {
    const plan = (await api.get(`/privacy/client/${clientId}`).expect(200)).body;
    expect(plan.blockers).toEqual([]);
    expect(plan.keeps.join(' ')).toContain('tax invoice');
    await api.post(`/privacy/client/${clientId}/erase`, { confirm: 'ERASE' }).expect(200);
    const [c] = await t.ds.query(`SELECT name, phone, email FROM client WHERE id = $1`, [clientId]);
    expect(c).toEqual({ name: 'Erased client', phone: null, email: null });
    const [inv] = await t.ds.query(`SELECT buyer_name FROM invoice WHERE wedding_id = $1`, [
      weddingId,
    ]);
    expect(inv.buyer_name).toBe('Test Family E2E');
    // The guests' ID files are deleted 30 days after the last flight (daily job).
    at('2027-01-22T04:30:00Z');
    await t.app.get(GuestsService).purgeDue();
    const [{ stored }] = await t.ds.query(
      `SELECT count(*)::int AS stored FROM guest WHERE leg_id = ANY($1) AND id_file_id IS NOT NULL`,
      [legIds],
    );
    expect(stored).toBe(0);
  });
});
