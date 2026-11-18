import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createOwner, createTestApp, login, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

describe('clients and consent', () => {
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
  const partner = async () =>
    (
      await authed(t.http().post('/api/partners'))
        .send({ type: 'PLANNER', firm: 'Planner P1' })
        .expect(201)
    ).body.id as string;

  it('needs login', async () => {
    await t.http().get('/api/clients').expect(401);
  });

  it('creates a client linked to a partner, with consent recorded at the same time', async () => {
    const partnerId = await partner();
    const { body } = await authed(t.http().post('/api/clients'))
      .send({
        name: 'Client C9 Family',
        phone: '98765 43210',
        partnerId,
        consent: { source: 'WHATSAPP' },
      })
      .expect(201);
    const c = (await authed(t.http().get(`/api/clients/${body.id}`)).expect(200)).body;
    expect(c).toMatchObject({
      name: 'Client C9 Family',
      type: 'FAMILY',
      phone: '+919876543210',
      partner: { id: partnerId, firm: 'Planner P1' },
    });
    expect(c.consents).toEqual([
      expect.objectContaining({ source: 'WHATSAPP', noticeVersion: 'v1-draft', withdrawnAt: null }),
    ]);
    const list = (await authed(t.http().get(`/api/clients?partnerId=${partnerId}`)).expect(200))
      .body;
    expect(list).toEqual([
      expect.objectContaining({
        name: 'Client C9 Family',
        partnerFirm: 'Planner P1',
        hasConsent: true,
        weddings: 0,
      }),
    ]);
    const partnerView = (await authed(t.http().get(`/api/partners/${partnerId}`)).expect(200)).body;
    expect(partnerView.clients.map((x: { name: string }) => x.name)).toEqual(['Client C9 Family']);
  });

  it('validates fields and the partner link', async () => {
    const res = await authed(t.http().post('/api/clients'))
      .send({
        name: 'X',
        email: 'nope',
        partnerId: '00000000-0000-4000-8000-000000000000',
        consent: { source: 'PIGEON' },
      })
      .expect(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['consent.source', 'email', 'name']);
    const bad = await authed(t.http().post('/api/clients'))
      .send({ name: 'Client C8', partnerId: '00000000-0000-4000-8000-000000000000' })
      .expect(400);
    expect(bad.body.fields.partnerId).toBe('Choose a partner from the list');
  });

  it('records and withdraws consent with the notice version in force', async () => {
    const partnerId = await partner();
    await authed(t.http().patch('/api/settings'))
      .send({ values: { 'privacy.notice_version': 'v2-2026-11' } })
      .expect(200);
    const c = (
      await authed(t.http().post('/api/consents'))
        .send({ subjectType: 'PARTNER', subjectId: partnerId, source: 'VERBAL_CALL' })
        .expect(201)
    ).body;
    expect(c).toMatchObject({
      noticeVersion: 'v2-2026-11',
      source: 'VERBAL_CALL',
      withdrawnAt: null,
    });
    const w = (await authed(t.http().post(`/api/consents/${c.id}/withdraw`)).expect(200)).body;
    expect(w.withdrawnAt).not.toBeNull();
    await authed(t.http().post(`/api/consents/${c.id}/withdraw`)).expect(409);
    // The record stays (proof of what was agreed and when it was withdrawn).
    const list = (
      await authed(t.http().get(`/api/consents?subjectType=PARTNER&subjectId=${partnerId}`)).expect(
        200,
      )
    ).body;
    expect(list).toHaveLength(1);
    const p = (await authed(t.http().get(`/api/partners/${partnerId}`)).expect(200)).body;
    expect(p.consents[0].withdrawnAt).not.toBeNull();
  });

  it('refuses consent for someone who does not exist, or dated in the future', async () => {
    await authed(t.http().post('/api/consents'))
      .send({
        subjectType: 'CLIENT',
        subjectId: '00000000-0000-4000-8000-000000000000',
        source: 'EMAIL',
      })
      .expect(404);
    const partnerId = await partner();
    const res = await authed(t.http().post('/api/consents'))
      .send({
        subjectType: 'PARTNER',
        subjectId: partnerId,
        source: 'EMAIL',
        givenAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(400);
    expect(res.body.fields.givenAt).toBe('Consent cannot be in the future');
  });

  it('audits client changes and consent records', async () => {
    const { body } = await authed(t.http().post('/api/clients'))
      .send({ name: 'Client C7', consent: { source: 'EMAIL' } })
      .expect(201);
    await authed(t.http().patch(`/api/clients/${body.id}`))
      .send({ name: 'Client C7 Family' })
      .expect(200);
    const rows: { entity: string; action: string }[] = await t.ds.query(
      `SELECT entity, action FROM audit_log WHERE entity IN ('client', 'consent') ORDER BY id`,
    );
    expect(rows.map((r) => `${r.entity}:${r.action}`)).toEqual([
      'client:CREATED',
      'consent:CREATED',
      'client:UPDATED',
    ]);
  });
});
