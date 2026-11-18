import { findLeaks } from '@shubhjets/shared';
import type { IncomingMessage } from 'node:http';
import type { Test } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { SEED_OWNER, seed } from '../src/db/seed-data.js';
import { AgreementsService } from '../src/documents/agreements.service.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { TemplatesService } from '../src/documents/templates.service.js';
import { PdfService } from '../src/pdf/pdf.service.js';
import { QuotesService } from '../src/quotes/quotes.service.js';
import { createTestApp, resetLimits, type TestApp } from './app.js';
import { PDF } from './fixtures.js';
import { resetDb } from './db.js';

const NOW = new Date('2026-11-18T06:00:00Z');

type Parser = Extract<Parameters<Test['parse']>[0], (res: never, cb: never) => void>;
const binary: Parser = (res, done) => {
  const stream = res as unknown as IncomingMessage;
  const chunks: Buffer[] = [];
  stream.on('data', (c: Buffer) => chunks.push(c));
  stream.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('agreements: made from records, drafts until approved, signed copies', () => {
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
    for (const svc of [TemplatesService, AgreementsService, DocumentsService, QuotesService])
      (t.app.get(svc) as { now: () => Date }).now = () => NOW;
    token = (await t.http().post('/api/auth/login').send(SEED_OWNER)).body.accessToken;
    for (const r of await t.ds.query(
      `SELECT code AS k, id FROM wedding UNION ALL SELECT brand, id FROM operator UNION ALL SELECT firm, id FROM partner`,
    ))
      ids[r.k] = r.id;
  });

  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);
  const make = (body: object) => authed(t.http().post('/api/agreements')).send(body);
  const pdfText = async (docId: string) => {
    const res = await authed(t.http().get(`/api/documents/${docId}/pdf`))
      .buffer(true)
      .parse(binary)
      .expect(200);
    return t.app.get(PdfService).text(res.body as Buffer);
  };
  const approve = async (kind: string) => {
    const tpl = (await authed(t.http().get(`/api/templates/${kind}`)).expect(200)).body;
    await authed(t.http().post(`/api/templates/${kind}/versions/${tpl.current.id}/approve`))
      .send({ approvedOn: '2026-11-17' })
      .expect(200);
  };
  const uploadSigned = (docId: string) =>
    authed(t.http().post(`/api/documents/${docId}/signed`)).attach('file', PDF, 'signed.pdf');

  it('makes the operator agreement from the operator record, watermarked as a draft', async () => {
    const res = await make({ kind: 'OPERATOR_AGREEMENT', operatorId: ids['Operator A'] }).expect(
      201,
    );
    expect(res.body).toMatchObject({ version: 1, draft: true });
    const text = (await pdfText(res.body.documentId)).replace(/\s+/g, ' ');
    for (const shown of [
      'OPERATOR–BROKER AGREEMENT',
      'DRAFT – NOT FOR SIGNATURE',
      'Operator A Aviation Pvt Ltd',
      'TEST-NSOP-001',
      'Example Exim LLP',
      'ANNEXURE A',
      '7 days or more before departure',
      'Operator A · Version 1',
    ])
      expect(text, shown).toContain(shown);
  });

  it('refuses a signed copy of a draft; after approval a complete version can be signed', async () => {
    const first = (
      await make({ kind: 'OPERATOR_AGREEMENT', operatorId: ids['Operator A'] }).expect(201)
    ).body;
    const refused = await uploadSigned(first.documentId).expect(409);
    expect(refused.body.message).toMatch(/^This version is a draft/);

    await approve('operator-agreement');
    // Approved templates are for signature, so every field must be filled in.
    await t.ds.query(`UPDATE operator SET cin = NULL WHERE brand = 'Operator A'`);
    const missing = await make({
      kind: 'OPERATOR_AGREEMENT',
      operatorId: ids['Operator A'],
    }).expect(409);
    expect(missing.body).toMatchObject({
      code: 'MISSING_FIELDS',
      message: 'Fill these in first: Operator CIN.',
    });
    await t.ds.query(
      `UPDATE operator SET cin = 'U00000DL2020PTC000001' WHERE brand = 'Operator A'`,
    );

    const second = (
      await make({ kind: 'OPERATOR_AGREEMENT', operatorId: ids['Operator A'] }).expect(201)
    ).body;
    expect(second).toMatchObject({
      documentId: first.documentId,
      version: 2,
      draft: false,
      missing: [],
    });
    expect(await pdfText(second.documentId)).not.toContain('DRAFT');
    await uploadSigned(second.documentId).expect(204);

    const docs = (
      await authed(t.http().get(`/api/documents?operatorId=${ids['Operator A']}`)).expect(200)
    ).body;
    expect(docs[0]).toMatchObject({ status: 'SIGNED', label: 'Operator–Broker Agreement' });
    expect(
      docs[0].versions.map((v: { version: number; signed: boolean; draft: boolean }) => [
        v.version,
        v.signed,
        v.draft,
      ]),
    ).toEqual([
      [2, true, false],
      [1, false, true],
    ]);
    // The operator's documents get the signed agreement too (verification checklist).
    const [od] = await t.ds.query(
      `SELECT verified_on FROM operator_document WHERE operator_id = $1 AND kind = 'OPERATOR_AGREEMENT'`,
      [ids['Operator A']],
    );
    expect(od.verified_on).toBe('2026-11-18');
    await authed(t.http().get(`/api/documents/${second.documentId}/signed`)).expect(200);
  });

  it('makes client terms from the accepted quote, with no internal figures (rule 4)', async () => {
    const res = await make({ kind: 'CLIENT_TERMS', weddingId: ids['W-104'] }).expect(201);
    const text = await pdfText(res.body.documentId);
    const flat = text.replace(/\s+/g, ' ');
    for (const shown of [
      'CHARTER TERMS AND BOOKING CONFIRMATION',
      'Client C4',
      'Hawker 800XP',
      'Operator A',
      'W-104',
      'Rupees',
      'Full payment to confirm the booking',
      '30 days or more before departure',
    ])
      expect(flat, shown).toContain(shown);
    // Operator A's package net rate (₹9,00,000), its leg shares (₹4,50,000) and our margin.
    const squashed = text.replace(/\s+/g, '');
    for (const leak of ['9,00,000', '4,50,000', '90,000', '45,000'])
      expect(squashed, leak).not.toContain(leak);
    expect(text).not.toMatch(/net rate|margin|markup|commission/i);
    const quotes = t.app.get(QuotesService);
    const [q] = await t.ds.query(
      `SELECT id FROM quote WHERE wedding_id = $1 AND status = 'ACCEPTED'`,
      [ids['W-104']],
    );
    const figures = await quotes.internalFigures(t.ds.manager, await quotes.find(q.id));
    const outward = await quotes.outward(t.ds.manager, await quotes.find(q.id));
    const allowed = [
      outward.subtotal,
      outward.total,
      outward.gst.cgst,
      outward.gst.sgst,
      outward.gst.total,
      ...outward.legs.flatMap((l) => [l.price, ...l.lines.map((x) => x.price)]),
      ...outward.extras.map((e) => e.price),
      ...outward.payment.map((p) => p.amount),
    ];
    expect(
      findLeaks(text, {
        ...figures,
        allowedAmounts: allowed,
        allowedPercents: [1800, 900, 1000, 5000, 10000],
      }),
    ).toEqual([]);
  });

  it('needs an issued quote for client terms', async () => {
    const res = await make({ kind: 'CLIENT_TERMS', weddingId: ids['W-101'] }).expect(409);
    expect(res.body.message).toMatch(/^Issue the quote first/);
  });

  it('makes the referral agreement with the partner’s commission; signing it marks the partner signed', async () => {
    const res = await make({ kind: 'REFERRAL_AGREEMENT', partnerId: ids['Planner P1'] }).expect(
      201,
    );
    const text = (await pdfText(res.body.documentId)).replace(/\s+/g, ' ');
    expect(text).toContain('PARTNER REFERRAL AGREEMENT');
    expect(text).toContain('Planner P1');
    expect(text).toMatch(
      /20% \(twenty per cent\) of the Margin on each Booking|2% \(two per cent\) of the Booking Value/,
    );

    await approve('referral-agreement');
    const v2 = (
      await make({ kind: 'REFERRAL_AGREEMENT', partnerId: ids['Planner P1'] }).expect(201)
    ).body;
    await uploadSigned(v2.documentId).expect(204);
    const [p] = await t.ds.query(
      `SELECT referral_signed, referral_document_id FROM partner WHERE id = $1`,
      [ids['Planner P1']],
    );
    expect(p).toEqual({ referral_signed: true, referral_document_id: v2.documentId });
  });

  it('logs sending, lists a wedding’s documents, and audits it all', async () => {
    const res = await make({ kind: 'CLIENT_TERMS', weddingId: ids['W-104'] }).expect(201);
    await authed(t.http().post(`/api/documents/${res.body.documentId}/sent`))
      .send({ channel: 'WHATSAPP', recipient: 'Client C4' })
      .expect(204);
    const docs = (
      await authed(t.http().get(`/api/documents?weddingId=${ids['W-104']}`)).expect(200)
    ).body;
    const terms = docs.find((d: { type: string }) => d.type === 'CLIENT_TERMS');
    expect(terms).toMatchObject({ status: 'SHARED' });
    expect(terms.shares).toEqual([
      expect.objectContaining({ channel: 'WHATSAPP', recipient: 'Client C4', version: 1 }),
    ]);
    const audit = await t.ds.query(
      `SELECT action FROM audit_log WHERE entity IN ('document', 'document_version') AND entity_id IN ($1::text, (SELECT id::text FROM document_version WHERE document_id = $1::uuid))`,
      [res.body.documentId],
    );
    expect(audit.map((a: { action: string }) => a.action)).toEqual(
      expect.arrayContaining(['CREATED', 'SHARED']),
    );
  });
});
