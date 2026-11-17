import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EXPIRY_CRON, JOBS_TIME_ZONE, JobsService } from '../src/jobs/jobs.service.js';
import { OperatorExpiryJob, alertThreshold } from '../src/jobs/operator-expiry.job.js';
import { OperatorsService } from '../src/operators/operators.service.js';
import { createOwner, createTestApp, login, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';
import { PDF } from './fixtures.js';

/** 10:00 IST on a calendar day. */
const at = (day: string) => new Date(`${day}T04:30:00Z`);

describe('daily operator expiry job (hard rule 8)', () => {
  let t: TestApp;
  let token: string;
  let ops: OperatorsService;
  let job: OperatorExpiryJob;

  beforeAll(async () => {
    t = await createTestApp();
    ops = t.app.get(OperatorsService);
    job = t.app.get(OperatorExpiryJob);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    await createOwner(t.ds);
    token = (await login(t)).accessToken;
    ops.now = () => at('2026-11-17');
  });

  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);

  async function verifiedOperator(insurance: string) {
    const { body } = await authed(t.http().post('/api/operators'))
      .send({ legalName: 'Operator C', nsopNo: 'TEST-3' })
      .expect(201);
    for (const [kind, date] of [
      ['NSOP', '2027-12-31'],
      ['INSURANCE', insurance],
    ]) {
      await authed(t.http().post(`/api/operators/${body.id}/documents`))
        .field('kind', kind!)
        .field('expiresOn', date!)
        .attach('file', PDF, 'd.pdf')
        .expect(201);
    }
    const docs = (await authed(t.http().get(`/api/operators/${body.id}`))).body.documents;
    for (const d of docs)
      await authed(t.http().post(`/api/operator-documents/${d.id}/verify`)).expect(204);
    await authed(t.http().post(`/api/operators/${body.id}/verify`)).expect(200);
    return body.id as string;
  }

  const status = async (id: string) =>
    (await t.ds.query(`SELECT status, blocked_reason FROM operator WHERE id = $1`, [id]))[0];

  it('picks the right alert for the days left', () => {
    expect([40, 31, 30, 8, 7, 0, -1].map(alertThreshold)).toEqual([null, null, 30, 30, 7, 7, 0]);
  });

  it('alerts at 30 and 7 days exactly once each, then blocks on expiry', async () => {
    const id = await verifiedOperator('2026-12-10'); // 23 days away

    const first = await job.run();
    expect(first.alerts).toEqual([
      { operatorId: id, kind: 'INSURANCE', expiresOn: '2026-12-10', daysLeft: 23, threshold: 30 },
    ]);
    expect((await status(id)).status).toBe('EXPIRING_SOON');
    expect((await job.run()).alerts).toEqual([]); // same day again: nothing new

    ops.now = () => at('2026-12-04'); // 6 days left
    expect((await job.run()).alerts.map((a) => a.threshold)).toEqual([7]);
    expect((await job.run()).alerts).toEqual([]);

    ops.now = () => at('2026-12-10'); // last valid day
    expect((await status(id)).status).toBe('EXPIRING_SOON');
    await job.run();
    expect((await status(id)).status).toBe('EXPIRING_SOON');

    ops.now = () => at('2026-12-11'); // expired
    const blocked = await job.run();
    expect(blocked.statusChanges).toEqual([
      { operatorId: id, from: 'EXPIRING_SOON', to: 'BLOCKED' },
    ]);
    expect(blocked.alerts.map((a) => a.threshold)).toEqual([0]);
    expect(await status(id)).toEqual({
      status: 'BLOCKED',
      blocked_reason: 'Insurance certificate expired on 10 Dec 2026',
    });
    await expect(ops.assertQuotable(id)).rejects.toThrow(/expired on 10 Dec 2026/);
  });

  it('records alerts and automatic blocks as done by the System', async () => {
    const id = await verifiedOperator('2026-12-10');
    await t.ds.query(`DELETE FROM audit_log`);
    ops.now = () => at('2026-12-11'); // the job's first run after the expiry
    await job.run();
    const rows: { actor_type: string; action: string }[] = await t.ds.query(
      `SELECT actor_type, action FROM audit_log WHERE entity_id = $1 ORDER BY id`,
      [id],
    );
    expect(rows).toEqual([
      { actor_type: 'SYSTEM', action: 'UPDATED' },
      { actor_type: 'SYSTEM', action: 'EXPIRY_ALERT' },
    ]);
  });

  it('starts a fresh alert cycle when a renewed document is verified, and lifts the automatic block', async () => {
    const id = await verifiedOperator('2026-12-10');
    ops.now = () => at('2026-12-11');
    await job.run();
    expect((await status(id)).status).toBe('BLOCKED');
    await authed(t.http().post(`/api/operators/${id}/documents`))
      .field('kind', 'INSURANCE')
      .field('expiresOn', '2027-12-10')
      .attach('file', PDF, 'renewed.pdf')
      .expect(201);
    const renewed = (await authed(t.http().get(`/api/operators/${id}`))).body.documents.find(
      (d: { expiresOn: string }) => d.expiresOn === '2027-12-10',
    );
    await authed(t.http().post(`/api/operator-documents/${renewed.id}/verify`)).expect(204);
    expect((await status(id)).status).toBe('VERIFIED');
    ops.now = () => at('2027-11-20'); // 20 days before the new expiry
    expect((await job.run()).alerts.map((a) => [a.expiresOn, a.threshold])).toEqual([
      ['2027-12-10', 30],
    ]);
  });

  it('leaves manual blocks alone and ignores operators you have not verified', async () => {
    const id = await verifiedOperator('2026-12-10');
    await authed(t.http().post(`/api/operators/${id}/block`))
      .send({ reason: 'Paused by me' })
      .expect(200);
    await authed(t.http().post('/api/operators')).send({ legalName: 'Operator D' }).expect(201);
    ops.now = () => at('2026-12-11');
    const res = await job.run();
    expect(res.checked).toBe(2);
    expect(await status(id)).toEqual({ status: 'BLOCKED', blocked_reason: 'Paused by me' });
  });

  it('registers the daily schedule with pg-boss in India time', async () => {
    const boss = await t.app.get(JobsService).start();
    try {
      const schedules = await boss.getSchedules();
      expect(schedules.find((s) => s.name === OperatorExpiryJob.NAME)).toMatchObject({
        cron: EXPIRY_CRON,
        timezone: JOBS_TIME_ZONE,
      });
    } finally {
      await boss.stop({ graceful: false });
    }
  });
});
