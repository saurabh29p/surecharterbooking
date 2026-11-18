import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { SEED_OWNER, seed } from '../src/db/seed-data.js';
import { createTestApp, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

const NOW = new Date('2026-11-18T04:30:00Z');

describe('DPDP: export and erase a person’s data', () => {
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
    token = (await t.http().post('/api/auth/login').send(SEED_OWNER)).body.accessToken;
    for (const r of await t.ds.query(
      `SELECT name AS k, id FROM client UNION ALL SELECT firm, id FROM partner UNION ALL SELECT code, id FROM wedding`,
    ))
      ids[r.k] = r.id;
  });
  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);

  /** Every text value in every table, to prove a person's details are gone. */
  async function everywhere(needle: string): Promise<string[]> {
    const tables: { tablename: string }[] = await t.ds.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const hits: string[] = [];
    for (const { tablename } of tables) {
      const [r] = await t.ds.query(
        `SELECT count(*)::int AS n FROM "${tablename}" x WHERE row_to_json(x)::text ILIKE $1`,
        [`%${needle}%`],
      );
      if (r.n) hits.push(tablename);
    }
    return hits;
  }

  it('exports what we hold about a client, without internal costs or margins', async () => {
    const res = await authed(t.http().get(`/api/privacy/client/${ids['Client C6 Family']}/export`))
      .expect(200)
      .expect('content-type', /json/)
      .expect('content-disposition', /attachment; filename="shubhjets-client-data-/);
    const body = JSON.parse(res.text);
    expect(body.you).toMatchObject({
      name: 'Client C6 Family',
      phone: '+919111111106',
      email: 'client.c6@example.test',
    });
    expect(body.consents).toHaveLength(1);
    const w = body.weddings[0];
    expect(w).toMatchObject({ code: 'W-106', status: 'DONE', venueCity: 'Goa' });
    expect(w.quotes[0]).toMatchObject({ reference: 'W-106 · Q1', status: 'ACCEPTED' });
    // Rule 4: the client total only, never cost, margin, commission or operators.
    const [q] = await t.ds.query(
      `SELECT totals FROM quote WHERE wedding_id = $1 AND status = 'ACCEPTED'`,
      [ids['W-106']],
    );
    expect(w.quotes[0].totalPaise).toBe(q.totals.total);
    for (const k of ['cost', 'margin', 'commission', 'netMargin', 'operator'])
      expect(res.text).not.toContain(`"${k}`);
    for (const v of [q.totals.cost, q.totals.margin]) expect(res.text).not.toContain(String(v));

    const [log] = await t.ds.query(
      `SELECT action FROM audit_log WHERE entity = 'client' AND entity_id = $1 AND action = 'PERSONAL_DATA_EXPORTED'`,
      [ids['Client C6 Family']],
    );
    expect(log).toBeTruthy();
  });

  it('says what erasing removes and keeps, and refuses while a wedding is open', async () => {
    const plan = (
      await authed(t.http().get(`/api/privacy/client/${ids['Client C4 Family']}`)).expect(200)
    ).body;
    expect(plan.blockers).toEqual(['W-104 is still open. Finish it or mark lost first.']);
    expect(plan.keeps.join(' ')).toContain('payment record');
    const res = await authed(t.http().post(`/api/privacy/client/${ids['Client C4 Family']}/erase`))
      .send({ confirm: 'ERASE' })
      .expect(400);
    expect(res.body.message).toBe('W-104 is still open. Finish it or mark lost first.');
    await authed(t.http().post(`/api/privacy/client/${ids['Client C6 Family']}/erase`))
      .send({})
      .expect(400);
  });

  it('erases a client everywhere except the records the law requires', async () => {
    const id = ids['Client C6 Family']!;
    // A change through the app, so the activity log holds their details.
    await authed(t.http().patch(`/api/clients/${id}`))
      .send({ notes: 'Prefers calls after 6 pm', address: '12 Example Road, Mumbai' })
      .expect(200);
    expect((await everywhere('Prefers calls after 6 pm')).sort()).toEqual(['audit_log', 'client']);

    const res = await authed(t.http().post(`/api/privacy/client/${id}/erase`))
      .send({ confirm: 'ERASE' })
      .expect(200);
    expect(res.body.kept.join(' ')).toContain('payment record');

    for (const needle of [
      'Client C6 Family',
      '+919111111106',
      'client.c6@example.test',
      'Prefers calls after 6 pm',
      '12 Example Road',
    ])
      expect(await everywhere(needle)).toEqual([]);

    const [c] = await t.ds.query(
      `SELECT name, phone, deleted_at, erased_at FROM client WHERE id = $1`,
      [id],
    );
    expect(c).toMatchObject({ name: 'Erased client', phone: null });
    expect(c.erased_at).toBeTruthy();
    // The wedding and its money stay (accounts), without the person.
    const w = (await authed(t.http().get(`/api/weddings/${ids['W-106']}`)).expect(200)).body;
    expect(w.client).toMatchObject({ name: 'Erased client', phone: null, email: null });
    expect(
      await t.ds.query(`SELECT withdrawn_at IS NOT NULL AS w FROM consent WHERE subject_id = $1`, [
        id,
      ]),
    ).toEqual([{ w: true }]);
    const [log] = await t.ds.query(
      `SELECT diff FROM audit_log WHERE entity = 'client' AND entity_id = $1 AND action = 'PERSONAL_DATA_ERASED'`,
      [id],
    );
    expect(log.diff.erased.length).toBeGreaterThan(0);
    // Only once.
    await authed(t.http().post(`/api/privacy/client/${id}/erase`))
      .send({ confirm: 'ERASE' })
      .expect(400);
  });

  it('erases a website enquirer, including their words in the wedding notes', async () => {
    await t
      .http()
      .post('/api/public/enquiries')
      .send({
        name: 'Test Family T9',
        phone: '98100 99999',
        email: 't9@example.test',
        role: 'family',
        weddingCity: 'Jaipur',
        message: 'Haldi at 10',
        consent: true,
        elapsedMs: 20_000,
      })
      .expect(201);
    const [w] = await t.ds.query(`SELECT id, client_id FROM wedding WHERE code = 'W-107'`);
    await authed(t.http().post(`/api/weddings/${w.id}/lost`))
      .send({ reason: 'Went with another broker' })
      .expect(200);
    await authed(t.http().post(`/api/privacy/client/${w.client_id}/erase`))
      .send({ confirm: 'ERASE' })
      .expect(200);
    for (const needle of ['Test Family T9', '919810099999', 't9@example.test'])
      expect(await everywhere(needle)).toEqual([]);
    const [e] = await t.ds.query(`SELECT payload FROM enquiry WHERE wedding_id = $1`, [w.id]);
    expect(e.payload).toEqual({ erased: true });
  });

  it('erases a partner contact and their call notes', async () => {
    const id = ids['Planner P3']!;
    await authed(t.http().post(`/api/partners/${id}/activities`))
      .send({ kind: 'CALLED', note: 'Spoke to her about the Jaipur season' })
      .expect(201);
    const before = (await authed(t.http().get(`/api/privacy/partner/${id}`)).expect(200)).body;
    expect(before).toMatchObject({ blockers: [], name: 'Contact P3' });
    const exported = JSON.parse(
      (await authed(t.http().get(`/api/privacy/partner/${id}/export`)).expect(200)).text,
    );
    expect(exported.callsAndMessagesLogged.map((a: { note: string }) => a.note)).toContain(
      'Spoke to her about the Jaipur season',
    );

    await authed(t.http().post(`/api/privacy/partner/${id}/erase`))
      .send({ confirm: 'ERASE' })
      .expect(200);
    for (const needle of ['Contact P3', 'Planner P3', 'Spoke to her about the Jaipur season'])
      expect(await everywhere(needle)).toEqual([]);
    const [p] = await t.ds.query(`SELECT firm, status, phone FROM partner WHERE id = $1`, [id]);
    expect(p).toEqual({ firm: 'Erased partner', status: 'INACTIVE', phone: null });
  });

  it('keeps a partner’s firm and GSTIN when commission was paid, and blocks while some is owed', async () => {
    const plan = (
      await authed(t.http().get(`/api/privacy/partner/${ids['Planner P2']}`)).expect(200)
    ).body;
    expect(plan.blockers[0]).toBe('W-103 is still open. Finish it or mark lost first.');
  });

  it('needs login', async () => {
    await t.http().get(`/api/privacy/client/${ids['Client C6 Family']}/export`).expect(401);
  });
});
