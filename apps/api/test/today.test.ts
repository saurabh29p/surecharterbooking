import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { SEED_OWNER, seed } from '../src/db/seed-data.js';
import { EnquiriesService } from '../src/enquiries/enquiries.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { TodayService } from '../src/today/today.service.js';
import { createTestApp, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

/** 10:00 am IST on the seed day. */
const NOW = new Date('2026-11-18T04:30:00Z');
const DAY = 86_400_000;

interface Action {
  key: string;
  kind: string;
  urgency: string;
  title: string;
  detail: string | null;
  to: string;
  button: { type: string; label: string; href?: string; to?: string; legId?: string };
}

describe('Today', () => {
  let t: TestApp;
  let token: string;
  let now: Date;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    await seed(t.ds, t.app.get(EncryptionService), NOW);
    now = NOW;
    for (const svc of [TodayService, PaymentsService, EnquiriesService])
      (t.app.get(svc) as { now: () => Date }).now = () => now;
    token = (await t.http().post('/api/auth/login').send(SEED_OWNER)).body.accessToken;
  });
  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);
  const today = async () => (await authed(t.http().get('/api/today')).expect(200)).body;
  const actions = async (): Promise<Action[]> => (await today()).actions;

  it('lists what to do now, most urgent first, each with one button', async () => {
    const list = await actions();
    expect(list.map((a) => [a.urgency, a.title])).toEqual([
      ['NOW', 'W-101: new website enquiry from Client C1 Family'],
      ['NOW', 'W-102: 2 of 4 rates in, chase Operator C'],
      ['NOW', 'W-102: 2 of 4 rates in, chase Operator D'],
      ['NOW', 'W-105: pay Operator C ₹6.0L'],
      ['TODAY', 'W-104 flies in 5 days: 8 guest IDs missing'],
      ['TODAY', 'W-102: rates in for every leg, choose and quote'],
      ['TODAY', 'Call Contact H1 (Hotel H1): follow-up 1 day late'],
      ['TODAY', 'Call Contact P3 (Planner P3): follow-up due today'],
      ['SOON', 'Operator C: insurance expires in 9 days'],
    ]);
    expect(new Set(list.map((a) => a.key)).size).toBe(list.length);
    for (const a of list) expect(a.button.label).toBeTruthy();

    // Chasing an operator never mentions the client (only the wedding code and city).
    const chase = list.find((a) => a.kind === 'CHASE_OPERATOR')!;
    expect(chase.button.href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    const text = decodeURIComponent(chase.button.href!.split('text=')[1]!);
    expect(text).toContain('W-102 (Jaipur wedding)');
    expect(text).not.toMatch(/Client C\d/);
  });

  it('shows the month against the target, the season and the overview', async () => {
    const b = await today();
    // W-104 (₹1.0L) and W-105 (₹0.6L) were confirmed this month; W-106 (₹0.7L) in September.
    expect(b.tracker.month).toMatchObject({
      label: 'Nov 2026',
      margin: 1_60_000_00,
      target: 20_00_000_00,
      percent: 8,
      weddingsConfirmed: 2,
      daysLeft: 12,
    });
    expect(b.tracker.season).toEqual({
      label: '2026-27',
      margin: 2_30_000_00,
      weddingsConfirmed: 3,
      averageMargin: 76_666_67,
    });
    expect(b.board.find((s: { status: string }) => s.status === 'QUOTED')).toMatchObject({
      count: 1,
    });
    expect(b.pipeline).toMatchObject({ followUpsDue: 2 });
    expect(b.leadSources.rows).toContainEqual({
      source: 'HOTEL',
      enquiries: 1,
      quotes: 1,
      bookings: 1,
      margin: 60_000_00,
      taps: 0,
    });
    // Return flights fold into one route; jets based at either end count.
    const udr = b.routes.find(
      (r: { from: string; to: string }) => r.from === 'DEL' && r.to === 'UDR',
    );
    expect(udr).toMatchObject({ upcoming: true, total: 3 });
    expect(
      b.routes.some((r: { from: string; to: string }) => r.from === 'UDR' && r.to === 'DEL'),
    ).toBe(false);

    // The target is a setting.
    await authed(t.http().patch('/api/settings'))
      .send({ values: { 'target.monthly_margin_paise': 10_00_000_00 } })
      .expect(200);
    expect((await today()).tracker.month).toMatchObject({ target: 10_00_000_00, percent: 16 });
  });

  it('"Later" hides an action until 7 am tomorrow, with undo', async () => {
    const key = (await actions()).find((a) => a.kind === 'CHASE_OPERATOR')!.key;
    await authed(t.http().post('/api/today/snoozes')).send({ key }).expect(201);
    let b = await today();
    expect(b.actions.map((a: Action) => a.key)).not.toContain(key);
    expect(b.snoozedCount).toBe(1);

    await authed(t.http().delete(`/api/today/snoozes/${encodeURIComponent(key)}`)).expect(204);
    expect((await actions()).map((a) => a.key)).toContain(key);

    await authed(t.http().post('/api/today/snoozes')).send({ key }).expect(201);
    now = new Date('2026-11-19T01:29:00Z'); // 6:59 am IST
    expect((await actions()).map((a) => a.key)).not.toContain(key);
    now = new Date('2026-11-19T01:31:00Z');
    b = await today();
    expect(b.actions.map((a: Action) => a.key)).toContain(key);
    expect(b.snoozedCount).toBe(0);
  });

  it('asks to mark flights flown once their day has passed, in one tap', async () => {
    now = new Date(NOW.getTime() + 2 * DAY);
    const flown = (await actions()).find((a) => a.kind === 'MARK_FLOWN')!;
    expect(flown).toMatchObject({ title: 'W-105: did leg 2 fly?', urgency: 'NOW' });
    await authed(t.http().post(`/api/legs/${flown.button.legId}/flown`)).expect(204);
    expect((await actions()).some((a) => a.kind === 'MARK_FLOWN')).toBe(false);
  });

  it('puts a client’s "I accept" on the link at the very top', async () => {
    const [q] = await t.ds.query(
      `SELECT q.id, q.wedding_id FROM quote q JOIN wedding w ON w.id = q.wedding_id
        WHERE w.code = 'W-103' AND q.status = 'SHARED'`,
    );
    const [d] = await t.ds.query(
      `INSERT INTO document (type, status, wedding_id, quote_id) VALUES ('QUOTE', 'SHARED', $1, $2) RETURNING id`,
      [q.wedding_id, q.id],
    );
    const [v] = await t.ds.query(
      `INSERT INTO document_version (document_id, version, audience) VALUES ($1, 1, 'OUTWARD') RETURNING id`,
      [d.id],
    );
    const [s] = await t.ds.query(
      `INSERT INTO share (document_version_id, channel) VALUES ($1, 'WHATSAPP') RETURNING id`,
      [v.id],
    );
    await t.ds.query(
      `INSERT INTO share_acceptance (share_id, name, accepted_at) VALUES ($1, 'Client C3 Family', $2)`,
      [s.id, new Date(NOW.getTime() - 3_600_000)],
    );
    const [first] = await actions();
    expect(first).toMatchObject({
      kind: 'ACCEPTANCE',
      title: 'W-103: Client C3 Family accepted the quote on the link',
      button: {
        type: 'OPEN',
        label: 'Confirm acceptance',
        to: `/weddings/${q.wedding_id}?tab=quote`,
      },
    });
  });

  it('turns a new website enquiry into a "reply on WhatsApp" action', async () => {
    await t
      .http()
      .post('/api/public/enquiries')
      .send({
        name: 'Test Family T9',
        phone: '98100 99999',
        role: 'family',
        weddingCity: 'Jaipur',
        consent: true,
        elapsedMs: 20_000,
      })
      .expect(201);
    const a = (await actions()).find((x) => x.title.includes('Test Family T9'))!;
    expect(a).toMatchObject({ kind: 'NEW_ENQUIRY', urgency: 'NOW' });
    expect(a.button.href).toMatch(
      /^https:\/\/wa\.me\/919810099999\?text=Namaste%20Test%20Family%20T9/,
    );
  });

  it('needs login', async () => {
    await t.http().get('/api/today').expect(401);
    await t.http().post('/api/today/snoozes').send({ key: 'x:y' }).expect(401);
  });
});
