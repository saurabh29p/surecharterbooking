import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { seed } from '../src/db/seed-data.js';
import { PartnersService } from '../src/partners/partners.service.js';
import { createOwner, createTestApp, login, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';
import { PDF } from './fixtures.js';

const NOW = new Date('2026-11-18T06:00:00Z');

describe('partners', () => {
  let t: TestApp;
  let token: string;
  let svc: PartnersService;

  beforeAll(async () => {
    t = await createTestApp();
    svc = t.app.get(PartnersService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    await createOwner(t.ds);
    token = (await login(t)).accessToken;
    svc.now = () => NOW;
  });

  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);
  const create = (body: object) => authed(t.http().post('/api/partners')).send(body);
  const get = (id: string) => authed(t.http().get(`/api/partners/${id}`));
  const activity = (id: string, body: object) =>
    authed(t.http().post(`/api/partners/${id}/activities`)).send(body);

  it('needs login', async () => {
    await t.http().get('/api/partners').expect(401);
  });

  it('creates a new lead with the default commission from Settings and normalised contact details', async () => {
    const { body } = await create({
      type: 'PLANNER',
      firm: 'Planner P9',
      phone: '98765 43210',
      email: 'P9@Example.TEST',
      website: 'p9.example.test',
      instagram: 'https://instagram.com/planner_p9/',
    }).expect(201);
    const p = (await get(body.id).expect(200)).body;
    expect(p).toMatchObject({
      status: 'IMPORTED',
      commissionBasis: 'MARGIN_SHARE',
      commissionBps: 2000,
      phone: '+919876543210',
      email: 'p9@example.test',
      website: 'https://p9.example.test',
      instagram: '@planner_p9',
      referralSigned: false,
    });
  });

  it('validates in plain words', async () => {
    const res = await create({ type: 'DJ', firm: 'X', phone: '123', email: 'nope' }).expect(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['email', 'firm', 'phone', 'type']);
  });

  it('checks duplicates on any one detail alone (regression: phone without website crashed)', async () => {
    await create({ type: 'PLANNER', firm: 'Phone only', phone: '9876543299' }).expect(201);
    const res = await create({
      type: 'PLANNER',
      firm: 'Email only',
      email: 'x@example.test',
    }).expect(201);
    expect(res.body.duplicates).toEqual([]);
    const dup = await create({ type: 'PLANNER', firm: 'Same phone', phone: '9876543299' }).expect(
      201,
    );
    expect(dup.body.duplicates).toEqual([
      expect.objectContaining({ firm: 'Phone only', matchedOn: ['phone'] }),
    ]);
  });

  it('warns about possible duplicates (same phone, email or website) without blocking', async () => {
    await create({
      type: 'PLANNER',
      firm: 'Planner P1',
      phone: '9876543210',
      website: 'https://www.p1.example.test',
    }).expect(201);
    const res = await create({
      type: 'PLANNER',
      firm: 'P1 Weddings',
      phone: '+91 98765 43210',
      website: 'p1.example.test/about',
    }).expect(201);
    expect(res.body.duplicates).toEqual([
      { id: expect.any(String), firm: 'Planner P1', matchedOn: ['phone', 'website'] },
    ]);
  });

  describe('pipeline', () => {
    it('moves forward from quick activities, never backwards', async () => {
      const { body } = await create({ type: 'HOTEL', firm: 'Hotel H9' }).expect(201);
      expect((await activity(body.id, { kind: 'NO_ANSWER' }).expect(201)).body.status).toBe(
        'CONTACTED',
      );
      expect(
        (await activity(body.id, { kind: 'CALLED', note: 'Interested for Feb' }).expect(201)).body
          .status,
      ).toBe('CALL_DONE');
      expect((await activity(body.id, { kind: 'SENT_DECK' }).expect(201)).body.status).toBe(
        'CALL_DONE',
      );
      await authed(t.http().patch(`/api/partners/${body.id}`))
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect((await activity(body.id, { kind: 'CALLED' }).expect(201)).body.status).toBe('ACTIVE');
      const p = (await get(body.id)).body;
      expect(p.activities.map((a: { kind: string }) => a.kind)).toEqual(
        expect.arrayContaining(['NO_ANSWER', 'CALLED', 'SENT_DECK']),
      );
      expect(p.activities).toHaveLength(4);
    });

    it('undo puts the status and follow-up back and removes the activity', async () => {
      const { body } = await create({
        type: 'PLANNER',
        firm: 'Planner P8',
        nextFollowUpOn: '2026-11-20',
      }).expect(201);
      const res = (
        await activity(body.id, { kind: 'CALLED', nextFollowUpOn: '2026-12-01' }).expect(201)
      ).body;
      expect(res).toMatchObject({
        status: 'CALL_DONE',
        nextFollowUpOn: '2026-12-01',
        undo: { status: 'IMPORTED', nextFollowUpOn: '2026-11-20' },
      });
      await authed(t.http().delete(`/api/partner-activities/${res.activityId}`))
        .send({ restoreStatus: res.undo.status, restoreFollowUpOn: res.undo.nextFollowUpOn })
        .expect(204);
      const p = (await get(body.id)).body;
      expect(p).toMatchObject({ status: 'IMPORTED', nextFollowUpOn: '2026-11-20', activities: [] });
    });

    it('lists follow-ups due today or earlier, with counts per status', async () => {
      await create({ type: 'PLANNER', firm: 'Due today', nextFollowUpOn: '2026-11-18' }).expect(
        201,
      );
      await create({ type: 'PLANNER', firm: 'Overdue', nextFollowUpOn: '2026-11-10' }).expect(201);
      await create({
        type: 'PLANNER',
        firm: 'Later',
        nextFollowUpOn: '2026-12-10',
        status: 'ACTIVE',
      }).expect(201);
      const due = (await authed(t.http().get('/api/partners?followUpDue=true')).expect(200)).body;
      expect(due.items.map((p: { firm: string }) => p.firm)).toEqual(['Overdue', 'Due today']);
      expect(due.followUpsDue).toBe(2);
      expect(due.counts).toMatchObject({ IMPORTED: 2, ACTIVE: 1, CONTACTED: 0 });
      const active = (await authed(t.http().get('/api/partners?status=ACTIVE')).expect(200)).body;
      expect(active.items.map((p: { firm: string }) => p.firm)).toEqual(['Later']);
    });
  });

  describe('commission and season figures (from the seed)', () => {
    it('works out weddings this season, bookings value and commission owed', async () => {
      await seed(t.ds, t.app.get(EncryptionService), NOW);
      resetLimits(t);
      token = (
        await authed(t.http().post('/api/auth/login')).send({
          email: 'owner@shubhjets.test',
          password: 'shubhjets dev passphrase',
        })
      ).body.accessToken;
      const list = (await authed(t.http().get('/api/partners')).expect(200)).body.items;
      const p1 = list.find((p: { firm: string }) => p.firm === 'Planner P1');
      const p2 = list.find((p: { firm: string }) => p.firm === 'Planner P2');
      // P1: W-102 (rates requested) + W-104 (signed & paid: sell ₹9.9L + ₹25,000 extra; 20% of ₹1,00,000 margin).
      expect(p1.stats).toEqual({
        weddingsThisSeason: 2,
        bookingsValue: 10_15_000_00,
        commissionEarned: 20_000_00,
        commissionPaid: 0,
        commissionOwed: 20_000_00,
      });
      // P2: W-103 (quoted only) + W-106 (done: 2% of ₹7.7L = ₹15,400, already paid).
      expect(p2.stats).toEqual({
        weddingsThisSeason: 2,
        bookingsValue: 7_70_000_00,
        commissionEarned: 15_400_00,
        commissionPaid: 15_400_00,
        commissionOwed: 0,
      });
      const detail = (await get(p1.id).expect(200)).body;
      expect(detail.weddings.map((w: { code: string }) => w.code)).toEqual(['W-102', 'W-104']);
      expect(detail.clients.map((c: { name: string }) => c.name)).toEqual([
        'Client C2 Family',
        'Client C4 Family',
      ]);
    });
  });

  it('stores the signed referral agreement and marks the partner as signed', async () => {
    const { body } = await create({ type: 'PLANNER', firm: 'Planner P7' }).expect(201);
    const res = await authed(t.http().post(`/api/partners/${body.id}/referral-agreement`))
      .attach('file', PDF, 'signed.pdf')
      .expect(200);
    expect(res.body).toMatchObject({ referralSigned: true, referralFileId: expect.any(String) });
    const removed = await authed(
      t.http().delete(`/api/partners/${body.id}/referral-agreement`),
    ).expect(200);
    expect(removed.body).toMatchObject({ referralSigned: false, referralFileId: null });
  });

  it('audits changes with before and after values', async () => {
    const { body } = await create({ type: 'PLANNER', firm: 'Planner P6' }).expect(201);
    await activity(body.id, { kind: 'CALLED' }).expect(201);
    const rows: { entity: string; action: string; diff: Record<string, unknown> }[] =
      await t.ds.query(
        `SELECT entity, action, diff FROM audit_log WHERE entity IN ('partner', 'partner_activity') ORDER BY id`,
      );
    expect(rows.map((r) => `${r.entity}:${r.action}`)).toEqual([
      'partner:CREATED',
      'partner_activity:CREATED',
      'partner:UPDATED',
    ]);
    expect(rows[2]!.diff).toEqual({ status: { from: 'IMPORTED', to: 'CALL_DONE' } });
  });
});
