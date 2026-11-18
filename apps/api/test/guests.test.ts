import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { SEED_OWNER, seed } from '../src/db/seed-data.js';
import { GuestIdPurgeJob } from '../src/guests/guest-id-purge.job.js';
import { GuestsService } from '../src/guests/guests.service.js';
import { createTestApp, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';
import { PNG } from './fixtures.js';

const NOW = new Date('2026-11-18T06:00:00Z');
const DAY = 86_400_000;

describe('guests and their IDs', () => {
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
    t.app.get(GuestsService).now = () => NOW;
    token = (await t.http().post('/api/auth/login').send(SEED_OWNER)).body.accessToken;
    for (const r of await t.ds.query(`SELECT code AS k, id FROM wedding`)) ids[r.k] = r.id;
  });

  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);
  const manifest = async (code = 'W-104') =>
    (await authed(t.http().get(`/api/weddings/${ids[code]}/guests`)).expect(200)).body;

  it('shows each leg’s guests, how many IDs are in, and when IDs are due and deleted', async () => {
    const m = await manifest();
    expect(m.idsDueOn).toBe('2026-11-18'); // 5 days before the first flight (23 Nov)
    expect(m.idsDeletedOn).toBe('2026-12-25'); // 30 days after the last flight (25 Nov)
    expect(
      m.legs.map((l: { seq: number; count: number; idsReceived: number }) => [
        l.seq,
        l.count,
        l.idsReceived,
      ]),
    ).toEqual([
      [1, 8, 2],
      [2, 0, 0],
    ]);
  });

  it('adds names pasted from WhatsApp, skips repeats, warns past the booked seats, and copies to another leg', async () => {
    const [l1, l2] = (await manifest()).legs;
    const res = await authed(t.http().post(`/api/legs/${l1.legId}/guests`))
      .send({ text: '1. Asha Mehta, +91 98100 00001\n2. guest g1\n3. Rohan Mehta' })
      .expect(201);
    expect(res.body).toEqual({
      added: 2,
      skipped: ['guest g1'],
      warning: 'Leg 1 now has 10 guests but is booked for 8. Update the leg if more are flying.',
    });
    const m = await manifest();
    expect(m.legs[0].guests.find((g: { name: string }) => g.name === 'Asha Mehta').phone).toBe(
      '+919810000001',
    );
    const copied = await authed(
      t.http().post(`/api/legs/${l2.legId}/guests/copy-from/${l1.legId}`),
    ).expect(201);
    expect(copied.body.added).toBe(10);
    expect((await manifest()).legs[1].idsReceived).toBe(0); // IDs are not copied
    await authed(t.http().post(`/api/legs/${l1.legId}/guests`))
      .send({ text: '  ' })
      .expect(400);
  });

  it('stores ID files encrypted, logs every opening, and deletes them on request', async () => {
    const guest = (await manifest()).legs[0].guests[3];
    await authed(t.http().post(`/api/guests/${guest.id}/id-document`))
      .attach('file', PNG, 'aadhaar.png')
      .expect(204);
    const after = (await manifest()).legs[0].guests[3];
    expect(after).toMatchObject({ idReceived: true, hasIdFile: true });
    const [file] = await t.ds.query(
      `SELECT f.encrypted, f.purge_at, g.id_purge_at FROM guest g JOIN file f ON f.id = g.id_file_id WHERE g.id = $1`,
      [guest.id],
    );
    expect(file.encrypted).toBe(true);
    expect(new Date(file.purge_at).toISOString()).toBe('2026-12-24T18:30:00.000Z'); // 25 Dec 00:00 IST

    const link = (
      await authed(t.http().post(`/api/guests/${guest.id}/id-document/link`)).expect(201)
    ).body;
    expect(link.url).toMatch(/^\/api\/files\/download\//);
    const [log] = await t.ds.query(`SELECT purpose FROM file_access_log ORDER BY at DESC LIMIT 1`);
    expect(log.purpose).toBe(`guest ID viewed: ${guest.name}`);

    const untick = await authed(t.http().patch(`/api/guests/${guest.id}`))
      .send({ idReceived: false })
      .expect(409);
    expect(untick.body.message).toBe('Delete the ID file first, then untick it.');
    await authed(t.http().delete(`/api/guests/${guest.id}/id-document`)).expect(204);
    const gone = (await manifest()).legs[0].guests[3];
    expect(gone).toMatchObject({ idReceived: true, hasIdFile: false });
    expect(gone.idDeletedAt).not.toBeNull();
  });

  it('deletes ID files automatically after the keeping period, and refuses new ones then', async () => {
    const [g1, g2] = (await manifest()).legs[0].guests;
    for (const g of [g1, g2])
      await authed(t.http().post(`/api/guests/${g.id}/id-document`))
        .attach('file', PNG, 'id.png')
        .expect(204);
    const job = t.app.get(GuestIdPurgeJob);
    expect(await job.run()).toBe(0); // not yet
    t.app.get(GuestsService).now = () => new Date(NOW.getTime() + 40 * DAY);
    expect(await job.run()).toBe(2);
    expect(await job.run()).toBe(0);
    const [{ n }] = await t.ds.query(
      `SELECT count(*)::int AS n FROM guest WHERE id_file_id IS NOT NULL`,
    );
    expect(n).toBe(0);
    const [{ purged }] = await t.ds.query(
      `SELECT count(*)::int AS purged FROM file WHERE purged_at IS NOT NULL`,
    );
    expect(purged).toBe(2);
    const late = await authed(t.http().post(`/api/guests/${g1.id}/id-document`))
      .attach('file', PNG, 'id.png')
      .expect(409);
    expect(late.body.message).toMatch(/past the ID keeping period/);
    const audit = await t.ds.query(
      `SELECT actor_type FROM audit_log WHERE entity = 'guest' AND entity_id = $1 ORDER BY at DESC LIMIT 1`,
      [g1.id],
    );
    expect(audit[0].actor_type).toBe('SYSTEM');
  });

  it('removing a guest removes their ID file too', async () => {
    const g = (await manifest()).legs[0].guests[0];
    await authed(t.http().post(`/api/guests/${g.id}/id-document`))
      .attach('file', PNG, 'id.png')
      .expect(204);
    await authed(t.http().delete(`/api/guests/${g.id}`)).expect(204);
    const [{ purged }] = await t.ds.query(
      `SELECT count(*)::int AS purged FROM file WHERE purged_at IS NOT NULL`,
    );
    expect(purged).toBe(1);
  });
});
