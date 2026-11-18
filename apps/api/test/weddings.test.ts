import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { seed } from '../src/db/seed-data.js';
import { createOwner, createTestApp, login, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

const LEG = {
  from: 'DEL',
  to: 'UDR',
  date: '2026-12-12',
  windowFrom: '09:00',
  windowTo: '12:00',
  pax: 8,
  category: 'MIDSIZE',
};

describe('weddings and legs', () => {
  let t: TestApp;
  let token: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    await createOwner(t.ds);
    token = (await login(t)).accessToken;
  });

  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);
  const create = (body: object) => authed(t.http().post('/api/weddings')).send(body);
  const get = (id: string) => authed(t.http().get(`/api/weddings/${id}`));

  it('needs login', async () => {
    await t.http().get('/api/weddings').expect(401);
  });

  describe('creating', () => {
    it('makes W-101 with its legs, a quick new client linked to the partner, and the defaults', async () => {
      const { body: profile } = await authed(t.http().post('/api/business-profiles'))
        .send({})
        .expect(201);
      const { body: partner } = await authed(t.http().post('/api/partners'))
        .send({ type: 'PLANNER', firm: 'Planner P1' })
        .expect(201);
      const res = await create({
        partnerId: partner.id,
        newClient: { name: 'Client C9 Family', phone: '98765 43210', consentSource: 'WHATSAPP' },
        venueCity: 'Udaipur',
        startsOn: '2026-12-12',
        endsOn: '2026-12-14',
        legs: [
          LEG,
          { ...LEG, from: 'UDR', to: 'DEL', date: '2026-12-15', windowFrom: '', windowTo: '' },
        ],
      }).expect(201);
      expect(res.body.code).toBe('W-101');
      const w = (await get(res.body.id).expect(200)).body;
      expect(w).toMatchObject({
        status: 'ENQUIRY',
        leadSource: 'PARTNER',
        requiredPaymentBps: 10000,
        businessProfile: { id: profile.id },
        partner: { firm: 'Planner P1' },
        client: { name: 'Client C9 Family', phone: '+919876543210' },
      });
      expect(
        w.legs.map(
          (l: {
            seq: number;
            fromIata: string;
            toIata: string;
            windowFrom: string | null;
            status: string;
          }) => [l.seq, l.fromIata, l.toIata, l.windowFrom, l.status],
        ),
      ).toEqual([
        [1, 'DEL', 'UDR', '09:00', 'OPEN'],
        [2, 'UDR', 'DEL', null, 'OPEN'],
      ]);
      const client = (await authed(t.http().get(`/api/clients/${w.client.id}`))).body;
      expect(client).toMatchObject({ partner: { id: partner.id } });
      expect(client.consents).toHaveLength(1);
    });

    it('explains bad input field by field, including inside legs', async () => {
      const res = await create({
        startsOn: '2026-12-14',
        endsOn: '2026-12-12',
        legs: [
          { ...LEG, to: 'DEL' },
          { ...LEG, pax: 0, windowTo: '08:00' },
        ],
      }).expect(400);
      expect(res.body.fields).toMatchObject({
        endsOn: 'The last day must be on or after the first day',
        'legs.0.to': 'Arrival must differ from departure',
        'legs.1.pax': 'At least 1 passenger',
        'legs.1.windowTo': 'The window must end after it starts',
      });
      const unknown = await create({ legs: [{ ...LEG, to: 'ZZZ' }] }).expect(400);
      expect(unknown.body.fields['legs.0.to']).toBe('Unknown airport ZZZ');
      const both = await create({
        clientId: '00000000-0000-4000-8000-000000000000',
        newClient: { name: 'X Family' },
      }).expect(400);
      expect(both.body.fields.clientId).toMatch(/not both/);
    });
  });

  describe('board', () => {
    it('lists the seed weddings with counts per status and money from the quote', async () => {
      await seed(t.ds, t.app.get(EncryptionService));
      resetLimits(t);
      token = (
        await t
          .http()
          .post('/api/auth/login')
          .send({ email: 'owner@shubhjets.test', password: 'shubhjets dev passphrase' })
      ).body.accessToken;
      const board = (await authed(t.http().get('/api/weddings')).expect(200)).body;
      expect(board.counts).toMatchObject({
        ENQUIRY: 1,
        RATES_REQUESTED: 1,
        QUOTED: 1,
        SIGNED_AND_PAID: 1,
        FLYING: 1,
        DONE: 1,
        LOST: 0,
      });
      const w104 = board.items.find((w: { code: string }) => w.code === 'W-104');
      expect(w104).toMatchObject({
        value: 10_15_000_00,
        margin: 1_00_000_00,
        legs: 2,
        pax: 8,
        partner: { firm: 'Planner P1' },
        quoteStatus: 'ACCEPTED',
      });
      const w101 = board.items.find((w: { code: string }) => w.code === 'W-101');
      expect(w101).toMatchObject({ value: null, leadSource: 'WEBSITE' });
      const quoted = (await authed(t.http().get('/api/weddings?status=QUOTED,ENQUIRY')).expect(200))
        .body.items;
      expect(quoted.map((w: { code: string }) => w.code).sort()).toEqual(['W-101', 'W-103']);
      const search = (await authed(t.http().get('/api/weddings?q=jodhpur')).expect(200)).body.items;
      expect(search.map((w: { code: string }) => w.code)).toEqual(['W-105']);
    });
  });

  describe('status by hand', () => {
    it('marks lost with a reason, reopens, and refuses other manual moves', async () => {
      const { body } = await create({ legs: [LEG] }).expect(201);
      await authed(t.http().post(`/api/weddings/${body.id}/lost`))
        .send({ reason: '' })
        .expect(400);
      const lost = (
        await authed(t.http().post(`/api/weddings/${body.id}/lost`))
          .send({ reason: 'Went with another broker' })
          .expect(200)
      ).body;
      expect(lost).toMatchObject({
        status: 'LOST',
        lostReason: 'Went with another broker',
        manualMoves: ['ENQUIRY'],
      });
      await authed(t.http().post(`/api/weddings/${body.id}/lost`))
        .send({ reason: 'Again' })
        .expect(409);
      const back = (await authed(t.http().post(`/api/weddings/${body.id}/reopen`)).expect(200))
        .body;
      expect(back).toMatchObject({ status: 'ENQUIRY', lostReason: null });
    });
  });

  describe('legs', () => {
    it('adds, edits and deletes legs, renumbering the rest', async () => {
      const { body } = await create({ legs: [LEG, { ...LEG, from: 'BOM' }] }).expect(201);
      const third = (
        await authed(t.http().post(`/api/weddings/${body.id}/legs`))
          .send({ ...LEG, from: 'UDR', to: 'DEL' })
          .expect(201)
      ).body;
      expect(third.seq).toBe(3);
      const edited = (
        await authed(t.http().patch(`/api/legs/${third.id}`))
          .send({ pax: 12, category: 'HEAVY', windowFrom: '14:00', windowTo: '' })
          .expect(200)
      ).body;
      expect(edited).toMatchObject({
        pax: 12,
        category: 'HEAVY',
        windowFrom: '14:00',
        windowTo: null,
      });
      await authed(t.http().patch(`/api/legs/${third.id}`))
        .send({ to: 'UDR' })
        .expect(400);
      const w = (await get(body.id)).body;
      await authed(t.http().delete(`/api/legs/${w.legs[0].id}`)).expect(204);
      const after = (await get(body.id)).body;
      expect(after.legs.map((l: { seq: number; fromIata: string }) => [l.seq, l.fromIata])).toEqual(
        [
          [1, 'BOM'],
          [2, 'UDR'],
        ],
      );
    });

    it('cannot be changed once the wedding is signed and paid', async () => {
      await seed(t.ds, t.app.get(EncryptionService));
      resetLimits(t);
      token = (
        await t
          .http()
          .post('/api/auth/login')
          .send({ email: 'owner@shubhjets.test', password: 'shubhjets dev passphrase' })
      ).body.accessToken;
      const [leg] = await t.ds.query(
        `SELECT l.id FROM leg l JOIN wedding w ON w.id = l.wedding_id WHERE w.code = 'W-104' LIMIT 1`,
      );
      const res = await authed(t.http().patch(`/api/legs/${leg.id}`))
        .send({ pax: 9 })
        .expect(409);
      expect(res.body.message).toMatch(/confirmed/);
    });
  });

  it('audits wedding and leg changes', async () => {
    const { body } = await create({ venueCity: 'Udaipur', legs: [LEG] }).expect(201);
    await authed(t.http().patch(`/api/weddings/${body.id}`))
      .send({ venueCity: 'Jaipur' })
      .expect(200);
    const rows: { entity: string; action: string; diff: Record<string, unknown> }[] =
      await t.ds.query(
        `SELECT entity, action, diff FROM audit_log WHERE entity IN ('wedding', 'leg') ORDER BY id`,
      );
    expect(rows.map((r) => `${r.entity}:${r.action}`)).toEqual([
      'wedding:CREATED',
      'leg:CREATED',
      'wedding:UPDATED',
    ]);
    expect(rows[2]!.diff).toEqual({ venueCity: { from: 'Udaipur', to: 'Jaipur' } });
  });
});
