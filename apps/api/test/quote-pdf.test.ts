import { findLeaks, formatINR } from '@shubhjets/shared';
import type { IncomingMessage } from 'node:http';
import type { Test } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { SEED_OWNER, seed } from '../src/db/seed-data.js';
import { OperatorsService } from '../src/operators/operators.service.js';
import { PdfService } from '../src/pdf/pdf.service.js';
import { QuotesService } from '../src/quotes/quotes.service.js';
import { RatesService } from '../src/weddings/rates.service.js';
import { createTestApp, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

const NOW = new Date('2026-11-18T06:00:00Z');
const L = 1_00_000_00;

/** Supertest: collect a binary body. */
type Parser = Extract<Parameters<Test['parse']>[0], (res: never, cb: never) => void>;
const binary: Parser = (res, done) => {
  const stream = res as unknown as IncomingMessage;
  const chunks: Buffer[] = [];
  stream.on('data', (c: Buffer) => chunks.push(c));
  stream.on('end', () => done(null, Buffer.concat(chunks)));
};

/**
 * Hard rule 4 on the real document: issue quotes, take the stored PDF, extract its text the way
 * any PDF reader would, and check that no operator net rate, cost, margin, markup, commission or
 * operator bank detail is in it, in any of the ways money is written.
 */
describe('quote PDF: branded document and the rule-4 text scan', () => {
  let t: TestApp;
  let token: string;
  let pdf: PdfService;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
    pdf = t.app.get(PdfService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    await seed(t.ds, t.app.get(EncryptionService), NOW);
    for (const svc of [RatesService, OperatorsService, QuotesService])
      (t.app.get(svc) as { now: () => Date }).now = () => NOW;
    token = (await t.http().post('/api/auth/login').send(SEED_OWNER)).body.accessToken;
    for (const r of await t.ds.query(
      `SELECT code AS k, id FROM wedding UNION ALL SELECT brand, id FROM operator`,
    ))
      ids[r.k] = r.id;
  });

  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);
  const rateOf = async (operator: string) =>
    (
      await t.ds.query(
        `SELECT r.id FROM rate_response r JOIN operator o ON o.id = r.operator_id
          JOIN wedding w ON w.id = r.wedding_id WHERE w.code = 'W-102' AND o.brand = $1`,
        [operator],
      )
    )[0].id as string;
  const legs = async () =>
    (await t.ds.query(
      `SELECT l.id FROM leg l JOIN wedding w ON w.id = l.wedding_id WHERE w.code = 'W-102' ORDER BY l.seq`,
    )) as { id: string }[];
  const draft = async (leg1 = 'Operator A', leg2 = leg1) => {
    const [l1, l2] = await legs();
    await authed(t.http().put(`/api/legs/${l1!.id}/choices`))
      .send({ rateResponseIds: [await rateOf(leg1)] })
      .expect(204);
    await authed(t.http().put(`/api/legs/${l2!.id}/choices`))
      .send({ rateResponseIds: [await rateOf(leg2)] })
      .expect(204);
    return (await authed(t.http().post(`/api/weddings/${ids['W-102']}/quotes`)).expect(201)).body;
  };
  const getPdf = async (path: string) => {
    const res = await authed(t.http().get(path)).buffer(true).parse(binary).expect(200);
    return res;
  };
  /** Every internal figure, written the usual ways, that must never appear. */
  const internalWritings = (amounts: number[]) =>
    amounts.flatMap((p) => [
      formatINR(p, { paise: 'never' }),
      formatINR(p, { paise: 'never', symbol: false }),
      String(Math.round(p / 100)),
    ]);

  it('issues a branded PDF whose text shows client prices and never internal figures', async () => {
    const q = await draft();
    await authed(t.http().post(`/api/quotes/${q.id}/issue`))
      .send({})
      .expect(200);
    const res = await getPdf(`/api/quotes/${q.id}/pdf`);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="ShubhJets-Quote-W-102-Q1.pdf"',
    );
    const bytes = res.body as Buffer;
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const text = await pdf.text(bytes);

    // What the client must see.
    for (const shown of [
      'ShubhJets',
      'Client C2',
      'New Delhi',
      'Jaipur',
      'Hawker 800XP',
      'Operated by Operator A',
      '₹5,22,500',
      '₹12,33,100',
      'CGST 9%',
      'Valid until',
      '19 Nov 2026',
      'Cancellation',
      // Our own bank account, for the client's payment.
      'Bank transfer to Example Exim LLP',
      '000011112222',
      'EXMP0000001',
    ])
      expect(text.replace(/\s+/g, ''), shown).toContain(shown.replace(/\s+/g, ''));

    // What must never be there: net rates (package and per leg), margin, commission, margin %.
    const squashed = text.replace(/\s+/g, '');
    for (const leak of [
      ...internalWritings([9.5 * L, 4.75 * L, 95_000_00, 47_500_00, 19_000_00, 76_000_00]),
      '9.09%',
      '9999000065', // Operator A's bank account
    ])
      expect(squashed, leak).not.toContain(leak.replace(/\s+/g, ''));
    expect(text).not.toMatch(/net rate|margin|markup|commission/i);

    // And the shared scanner agrees, with every internal figure of this quote.
    const svc = t.app.get(QuotesService);
    const figures = await svc.internalFigures(t.ds.manager, await svc.find(q.id));
    const allowed = [5.225 * L, 10.45 * L, 12.331 * L, 94_050_00, 1.881 * L];
    expect(
      findLeaks(text, {
        ...figures,
        allowedAmounts: allowed,
        allowedPercents: [1800, 900, 1000, 5000, 10000],
      }),
    ).toEqual([]);
  });

  it('keeps a complex quote clean too: two operators, fixed markup, extras, instalments, IGST', async () => {
    const q = await draft('Operator A', 'Operator B');
    const [l1] = await legs();
    await authed(t.http().patch(`/api/quotes/${q.id}`))
      .send({
        lines: [
          {
            legId: l1!.id,
            rateResponseId: q.legs[0].lines[0].rateResponseId,
            markupType: 'FIXED',
            markupValue: 60_000_00,
          },
        ],
        extras: [{ description: 'Floral welcome on board', cost: 18_000_00, sell: 30_000_00 }],
        paymentPlanBps: [5000, 5000],
        placeOfSupplyState: '08', // Rajasthan: IGST
      })
      .expect(200);
    await authed(t.http().post(`/api/quotes/${q.id}/issue`))
      .send({})
      .expect(200);
    const text = await pdf.text((await getPdf(`/api/quotes/${q.id}/pdf`)).body as Buffer);
    expect(text).toContain('IGST 18%');
    expect(text).toContain('Operated by Operator B');
    expect(text).toContain('50% advance to confirm the booking');
    const squashed = text.replace(/\s+/g, '');
    // Operator B's package (₹10,20,000) and leg share (₹5,10,000); our margins; the extra's cost.
    for (const leak of internalWritings([10.2 * L, 5.1 * L, 60_000_00, 51_000_00, 18_000_00]))
      expect(squashed, leak).not.toContain(leak.replace(/\s+/g, ''));
  });

  it('refuses to issue a PDF that would show an internal figure, and changes nothing', async () => {
    const q = await draft();
    // Someone pastes the operator's net rate into the client-facing text by mistake.
    await authed(t.http().patch(`/api/quotes/${q.id}`))
      .send({ exclusions: 'Operator quoted 4,75,000 per leg' })
      .expect(200);
    const res = await authed(t.http().post(`/api/quotes/${q.id}/issue`))
      .send({})
      .expect(409);
    expect(res.body.code).toBe('LEAK_BLOCKED');
    expect(res.body.message).toMatch(
      /^Stopped: the quote PDF would show internal figures \(Operator A cost/,
    );
    const [row] = await t.ds.query(`SELECT status FROM quote WHERE id = $1`, [q.id]);
    expect(row.status).toBe('DRAFT');
    const [{ n }] = await t.ds.query(
      `SELECT count(*)::int AS n FROM document WHERE quote_id = $1`,
      [q.id],
    );
    expect(n).toBe(0);
    const [{ legs: legStatus }] = await t.ds.query(
      `SELECT array_agg(status ORDER BY seq) AS legs FROM leg WHERE wedding_id = $1`,
      [ids['W-102']],
    );
    expect(legStatus).not.toContain('QUOTED');
  });

  it('also blocks internal words and operator bank details', async () => {
    const q = await draft();
    await authed(t.http().patch(`/api/quotes/${q.id}`))
      .send({ inclusions: 'Our margin is small' })
      .expect(200);
    const words = await authed(t.http().get(`/api/quotes/${q.id}/preview`)).expect(409);
    expect(words.body.message).toContain('the word "margin"');
    await authed(t.http().patch(`/api/quotes/${q.id}`))
      .send({ inclusions: 'Pay the operator directly: A/c 9999000065' })
      .expect(200);
    const bank = await authed(t.http().get(`/api/quotes/${q.id}/preview`)).expect(409);
    expect(bank.body.message).toContain('Operator A bank account number');
  });

  it('previews a draft with a watermark, without storing anything', async () => {
    const q = await draft();
    const res = await getPdf(`/api/quotes/${q.id}/preview`);
    expect(res.headers['content-disposition']).toMatch(/^inline;/);
    const text = await pdf.text(res.body as Buffer);
    expect(text).toContain('PREVIEW · NOT SENT');
    expect(text.replace(/\s+/g, '')).toContain('₹12,33,100');
    const [{ n }] = await t.ds.query(`SELECT count(*)::int AS n FROM file`);
    expect(n).toBe(0);
  });

  it('logs each share on the document and marks the quote sent', async () => {
    const q = await draft();
    await authed(t.http().post(`/api/quotes/${q.id}/issue`))
      .send({})
      .expect(200);
    await authed(t.http().get(`/api/quotes/${q.id}/pdf`)).expect(200);
    await authed(t.http().post(`/api/quotes/${q.id}/sent`))
      .send({ channel: 'WHATSAPP', recipient: 'Planner P1' })
      .expect(200);
    await authed(t.http().post(`/api/quotes/${q.id}/sent`))
      .send({ channel: 'EMAIL' })
      .expect(200);
    const shares = (await authed(t.http().get(`/api/quotes/${q.id}/shares`)).expect(200)).body;
    expect(shares.map((s: { channel: string }) => s.channel).sort()).toEqual(['EMAIL', 'WHATSAPP']);
    const [doc] = await t.ds.query(`SELECT status FROM document WHERE quote_id = $1`, [q.id]);
    expect(doc.status).toBe('SHARED');
    const audit = await t.ds.query(
      `SELECT diff FROM audit_log WHERE entity = 'quote' AND entity_id = $1 AND action = 'SHARED'`,
      [q.id],
    );
    expect(audit).toHaveLength(2);
  });
});
