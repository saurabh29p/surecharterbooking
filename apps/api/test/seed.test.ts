import { checkPayoutCovered, requiredPayment } from '@shubhjets/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { SEED_OWNER, seed } from '../src/db/seed-data.js';
import { createTestApp, resetLimits, type TestApp } from './app.js';

describe('seed data', () => {
  let t: TestApp;
  let counts: Record<string, number>;

  beforeAll(async () => {
    t = await createTestApp();
    counts = (await seed(t.ds, t.app.get(EncryptionService))).counts;
    resetLimits(t);
  });
  afterAll(() => t.close());

  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    t.ds.query(sql, params) as Promise<T[]>;

  it('has W-101 to W-106, one in each status of the pipeline', async () => {
    const rows = await q<{ code: string; status: string }>(
      `SELECT code, status FROM wedding ORDER BY number`,
    );
    expect(rows).toEqual([
      { code: 'W-101', status: 'ENQUIRY' },
      { code: 'W-102', status: 'RATES_REQUESTED' },
      { code: 'W-103', status: 'QUOTED' },
      { code: 'W-104', status: 'SIGNED_AND_PAID' },
      { code: 'W-105', status: 'FLYING' },
      { code: 'W-106', status: 'DONE' },
    ]);
  });

  it('uses only fake names, emails, NSOP numbers and registrations', async () => {
    const partners = await q<{ firm: string; email: string }>(`SELECT firm, email FROM partner`);
    expect(partners.map((p) => p.firm).sort()).toEqual([
      'Hotel H1',
      'Planner P1',
      'Planner P2',
      'Planner P3',
      'Planner P4',
    ]);
    expect(partners.every((p) => p.email.endsWith('@example.test'))).toBe(true);
    const ops = await q<{ legal_name: string; nsop_no: string }>(
      `SELECT legal_name, nsop_no FROM operator`,
    );
    expect(
      ops.every((o) => /^Operator [A-D] /.test(o.legal_name) && o.nsop_no.startsWith('TEST-')),
    ).toBe(true);
    const regs = await q<{ registration: string }>(`SELECT registration FROM aircraft`);
    expect(regs.every((r) => /^VT-ZZ\d$/.test(r.registration))).toBe(true);
    const clients = await q<{ name: string; email: string }>(`SELECT name, email FROM client`);
    expect(
      clients.every((c) => /^Client C\d Family$/.test(c.name) && c.email.endsWith('@example.test')),
    ).toBe(true);
  });

  it('has operators in every verification state, with bank details encrypted', async () => {
    const ops = await q<{ brand: string; status: string; bank: Buffer | null }>(
      `SELECT brand, status, bank_details_enc AS bank FROM operator ORDER BY brand`,
    );
    expect(ops.map((o) => [o.brand, o.status])).toEqual([
      ['Operator A', 'VERIFIED'],
      ['Operator B', 'VERIFIED'],
      ['Operator C', 'EXPIRING_SOON'],
      ['Operator D', 'FOUND'],
    ]);
    for (const o of ops.filter((x) => x.bank))
      expect(Buffer.from(o.bank!).toString('latin1')).not.toMatch(/9999/);
  });

  it('only uses verified (or still-valid expiring) operators on quotes', async () => {
    const rows = await q<{ status: string }>(
      `SELECT DISTINCT o.status FROM quote_line ql JOIN rate_response r ON r.id = ql.rate_response_id JOIN operator o ON o.id = r.operator_id`,
    );
    expect(rows.map((r) => r.status).sort()).toEqual(['EXPIRING_SOON', 'VERIFIED']);
  });

  it('has quote totals that match their lines', async () => {
    const quotes = await q<{ id: string; totals: { sellSubtotal: number; cost: number } }>(
      `SELECT id, totals FROM quote`,
    );
    for (const qt of quotes) {
      const [sum] = await q<{ sell: string; cost: string }>(
        `SELECT sum(sell) AS sell, sum(cost) AS cost FROM quote_line WHERE quote_id = $1`,
        [qt.id],
      );
      expect(Number(sum!.sell)).toBe(qt.totals.sellSubtotal);
      expect(Number(sum!.cost)).toBe(qt.totals.cost);
    }
  });

  it('respects the money rules: paid before confirmed, payouts covered by client money', async () => {
    const rows = await q<{
      code: string;
      status: string;
      total: number;
      required_payment_bps: number;
      client_in: string;
      payouts: string;
    }>(`
      SELECT w.code, w.status, (qt.totals->>'total')::bigint AS total, w.required_payment_bps,
        coalesce((SELECT sum(amount) FROM payment WHERE wedding_id = w.id AND direction = 'CLIENT_IN'), 0) AS client_in,
        coalesce((SELECT sum(amount) FROM payment WHERE wedding_id = w.id AND direction <> 'CLIENT_IN'), 0) AS payouts
      FROM wedding w JOIN quote qt ON qt.wedding_id = w.id AND qt.status = 'ACCEPTED'`);
    expect(rows.map((r) => r.code)).toEqual(['W-104', 'W-105', 'W-106']);
    for (const r of rows) {
      expect(Number(r.client_in)).toBeGreaterThanOrEqual(
        requiredPayment(Number(r.total), r.required_payment_bps),
      );
      expect(checkPayoutCovered(Number(r.client_in), 0, Number(r.payouts)).allowed).toBe(true);
    }
  });

  it('gives Today something to do: overdue rate replies, an expiring quote, missing guest IDs', async () => {
    const [chase] = await q<{ n: number }>(`
      SELECT count(*)::int AS n FROM rate_request rq
      WHERE NOT EXISTS (SELECT 1 FROM rate_response r WHERE r.rate_request_id = rq.id) AND rq.sent_at < now() - interval '2 hours'`);
    expect(chase!.n).toBe(2);
    const [expiring] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM quote WHERE status = 'SHARED' AND valid_until < now() + interval '3 hours 1 minute'`,
    );
    expect(expiring!.n).toBe(1);
    const [missing] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM guest WHERE NOT id_received`,
    );
    expect(missing!.n).toBe(6);
  });

  it('lets you log in as the demo owner, already set up', async () => {
    const res = await t
      .http()
      .post('/api/auth/login')
      .send({ email: SEED_OWNER.email, password: SEED_OWNER.password })
      .expect(200);
    expect(res.body.user.setupCompleted).toBe(true);
    const profiles = await t
      .http()
      .get('/api/business-profiles')
      .set('authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    expect(profiles.body[0]).toMatchObject({
      label: 'Delhi',
      isDefault: true,
      readiness: { missing: [] },
    });
  });

  it('can be run again and gives the same data', async () => {
    const again = await seed(t.ds, t.app.get(EncryptionService));
    expect(again.counts).toEqual(counts);
    const [w] = await q<{ code: string }>(`SELECT min(code) AS code FROM wedding`);
    expect(w!.code).toBe('W-101');
  });
});
