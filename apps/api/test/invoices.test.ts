import type { IncomingMessage } from 'node:http';
import type { Test } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { SEED_OWNER, seed } from '../src/db/seed-data.js';
import { InvoicesService } from '../src/invoices/invoices.service.js';
import { PdfService } from '../src/pdf/pdf.service.js';
import { QuotesService } from '../src/quotes/quotes.service.js';
import { createTestApp, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

const NOW = new Date('2026-11-18T06:00:00Z');

type Parser = Extract<Parameters<Test['parse']>[0], (res: never, cb: never) => void>;
const binary: Parser = (res, done) => {
  const stream = res as unknown as IncomingMessage;
  const chunks: Buffer[] = [];
  stream.on('data', (c: Buffer) => chunks.push(c));
  stream.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('GST invoices and rate request PDFs', () => {
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
    for (const svc of [InvoicesService, QuotesService])
      (t.app.get(svc) as { now: () => Date }).now = () => NOW;
    token = (await t.http().post('/api/auth/login').send(SEED_OWNER)).body.accessToken;
    for (const r of await t.ds.query(`SELECT code AS k, id FROM wedding`)) ids[r.k] = r.id;
  });

  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);
  const confirmGst = () =>
    authed(t.http().patch('/api/settings'))
      .send({ values: { 'gst.sac': '996412' }, confirmGst: true })
      .expect(200);
  const issue = (code = 'W-104', body: object = {}) =>
    authed(t.http().post(`/api/weddings/${ids[code]}/invoices`)).send(body);
  const pdfText = async (documentId: string) => {
    const res = await authed(t.http().get(`/api/documents/${documentId}/pdf`))
      .buffer(true)
      .parse(binary)
      .expect(200);
    return t.app.get(PdfService).text(res.body as Buffer);
  };

  it('is blocked until the CA confirms GST, and says so', async () => {
    const list = (await authed(t.http().get(`/api/weddings/${ids['W-104']}/invoices`)).expect(200))
      .body;
    expect(list.blockers).toEqual([
      'Your CA has not confirmed the GST rate and SAC code yet (Settings → Rules)',
    ]);
    const res = await issue().expect(409);
    expect(res.body.code).toBe('INVOICE_BLOCKED');
  });

  it('lists every other blocker in plain words', async () => {
    await confirmGst();
    await t.ds.query(`UPDATE business_profile SET gstin = NULL`);
    await t.ds.query(`UPDATE client SET address = NULL WHERE name LIKE 'Client C4%'`);
    const list = (await authed(t.http().get(`/api/weddings/${ids['W-104']}/invoices`)).expect(200))
      .body;
    expect(list.blockers).toEqual([
      'Add the GSTIN before issuing invoices',
      "Add the client's billing address (Partners → Clients)",
    ]);
    const noQuote = (
      await authed(t.http().get(`/api/weddings/${ids['W-102']}/invoices`)).expect(200)
    ).body;
    expect(noQuote.blockers).toContain('The client has not accepted a quote yet');
  });

  it('issues a full-value tax invoice with every required detail and no internal figures', async () => {
    await confirmGst();
    const res = await issue().expect(201);
    expect(res.body.number).toBe('VK/2026-27/0001');
    const text = await pdfText(res.body.documentId);
    const flat = text.replace(/\s+/g, ' ');
    for (const shown of [
      'Tax invoice',
      'VK/2026-27/0001',
      'Example Exim LLP',
      'BILL TO',
      'Client C4',
      '1 Example Road',
      'Unregistered',
      'SAC',
      '996412',
      'Place of supply',
      'Delhi (07)',
      'Reverse charge',
      'CGST @ 9%',
      'SGST @ 9%',
      'Amount in words',
      'Rupees',
      'Hawker 800XP',
      'operated by Operator A',
      'Floral welcome on board',
      'Authorised signatory',
    ])
      expect(flat, shown).toContain(shown);
    const squashed = text.replace(/\s+/g, '');
    // Operator A's package (₹9,00,000) and leg shares (₹4,50,000), our margins, the extra's cost.
    // Whole amounts only: "15,000" is inside the subtotal "10,15,000".
    for (const leak of ['9,00,000', '4,50,000', '90,000', '45,000', '15,000'])
      expect(squashed, leak).not.toMatch(new RegExp(`(?<![\\d,])${leak}(?![\\d])`));
    expect(text).not.toMatch(/net rate|margin|markup|commission/i);
    const [inv] = await t.ds.query(`SELECT fy, seq, taxable, total, document_id FROM invoice`);
    expect(inv).toMatchObject({ fy: '2026-27', seq: 1, document_id: res.body.documentId });
  });

  it('never reuses a number: one live invoice per quote, cancel then reissue; numbers restart each financial year', async () => {
    await confirmGst();
    const first = (await issue().expect(201)).body;
    const again = await issue().expect(409);
    expect(again.body.message).toBe(
      'Already invoiced: VK/2026-27/0001. Cancel it first to issue a new one.',
    );
    await authed(t.http().post(`/api/invoices/${first.id}/cancel`))
      .send({ reason: 'Wrong billing name' })
      .expect(204);
    expect((await issue().expect(201)).body.number).toBe('VK/2026-27/0002');
    const list = (await authed(t.http().get(`/api/weddings/${ids['W-104']}/invoices`)).expect(200))
      .body;
    expect(
      list.invoices.map((i: { number: string; cancelReason: string | null }) => [
        i.number,
        i.cancelReason,
      ]),
    ).toEqual([
      ['VK/2026-27/0002', null],
      ['VK/2026-27/0001', 'Wrong billing name'],
    ]);
    // An invoice dated in the previous financial year starts that year's own sequence.
    await authed(t.http().post(`/api/invoices/${list.invoices[0].id}/cancel`))
      .send({ reason: 'Dated wrongly' })
      .expect(204);
    expect((await issue('W-104', { issuedOn: '2026-03-31' }).expect(201)).body.number).toBe(
      'VK/2025-26/0001',
    );
    await issue('W-105').expect(201);
    const [last] = await t.ds.query(`SELECT number FROM invoice ORDER BY created_at DESC LIMIT 1`);
    expect(last.number).toBe('VK/2026-27/0003');
    await issue('W-106', { issuedOn: '2026-12-01' }).expect(409);
  });

  it('makes the rate request PDF for the operator, without the client, partner or any price', async () => {
    const [rq] = await t.ds.query(
      `SELECT rq.id FROM rate_request rq JOIN operator o ON o.id = rq.operator_id
         JOIN wedding w ON w.id = rq.wedding_id WHERE w.code = 'W-102' AND o.brand = 'Operator A'`,
    );
    const res = await authed(t.http().post(`/api/rate-requests/${rq.id}/pdf`)).expect(201);
    const text = (await pdfText(res.body.documentId)).replace(/\s+/g, ' ');
    for (const shown of [
      'Rate request',
      'Dear Operator A team',
      'W-102',
      'New Delhi → Jaipur',
      'Jaipur → New Delhi',
      '8 passengers',
      'Midsize jet or larger',
      'Please reply with',
      'cancellation charges',
    ])
      expect(text, shown).toContain(shown);
    for (const hidden of ['Client C2', 'Planner P1', '₹']) expect(text).not.toContain(hidden);
    const [{ document_id }] = await t.ds.query(
      `SELECT document_id FROM rate_request WHERE id = $1`,
      [rq.id],
    );
    expect(document_id).toBe(res.body.documentId);
    const again = await authed(t.http().post(`/api/rate-requests/${rq.id}/pdf`)).expect(201);
    expect(again.body).toEqual({ documentId: res.body.documentId, version: 2 });
  });
});
