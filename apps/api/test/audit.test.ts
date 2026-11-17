import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../src/audit/audit.service.js';
import { currentActor, runAs } from '../src/audit/request-context.js';
import { BusinessProfile } from '../src/business-profiles/business-profile.entity.js';
import { BusinessProfilesService } from '../src/business-profiles/business-profiles.service.js';
import { createOwner, createTestApp, login, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

interface Row {
  actor_type: string;
  actor_id: string | null;
  entity: string;
  entity_id: string;
  action: string;
  diff: Record<string, unknown> | null;
}

describe('audit log', () => {
  let t: TestApp;
  let token: string;
  let ownerId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    ownerId = await createOwner(t.ds);
    token = (await login(t)).accessToken;
    await t.ds.query(`DELETE FROM audit_log`);
  });

  const rows = () =>
    t.ds.query(
      `SELECT actor_type, actor_id, entity, entity_id, action, diff FROM audit_log ORDER BY id`,
    ) as Promise<Row[]>;
  const authed = (req: ReturnType<ReturnType<TestApp['http']>['get']>) =>
    req.set('authorization', `Bearer ${token}`);

  describe('automatic change tracking', () => {
    it('logs creation with the user who did it, and secrets redacted', async () => {
      const res = await authed(t.http().post('/api/business-profiles')).send({
        brandName: 'ShubhJets',
        bankDetails: {
          accountName: 'X',
          accountNumber: '123456789012',
          ifsc: 'HDFC0001234',
          bankName: 'Example Bank',
        },
      });
      expect(res.status).toBe(201);
      const [row] = await rows();
      expect(row).toMatchObject({
        actor_type: 'USER',
        actor_id: ownerId,
        entity: 'business_profile',
        entity_id: res.body.id,
        action: 'CREATED',
      });
      expect(row!.diff).toMatchObject({
        brandName: 'ShubhJets',
        stateCode: '07',
        bankDetailsEnc: '[redacted]',
        bankHint: 'Example Bank ••••9012',
      });
      expect(JSON.stringify(row)).not.toContain('123456789012');
    });

    it('logs only the fields that changed, with before and after', async () => {
      const { body: p } = await authed(t.http().post('/api/business-profiles')).send({
        brandName: 'Old',
        legalName: 'Same LLP',
      });
      await authed(t.http().patch(`/api/business-profiles/${p.id}`)).send({
        brandName: 'New',
        legalName: 'Same LLP',
      });
      const updates = (await rows()).filter((r) => r.action === 'UPDATED');
      expect(updates).toHaveLength(1);
      expect(updates[0]!.diff).toEqual({ brandName: { from: 'Old', to: 'New' } });
    });

    it('writes nothing when nothing changed', async () => {
      const { body: p } = await authed(t.http().post('/api/business-profiles')).send({
        brandName: 'Same',
      });
      await authed(t.http().patch(`/api/business-profiles/${p.id}`)).send({ brandName: 'Same' });
      expect((await rows()).map((r) => r.action)).toEqual(['CREATED']);
    });

    it('records both sides of switching the default profile', async () => {
      const { body: a } = await authed(t.http().post('/api/business-profiles')).send({});
      const { body: b } = await authed(t.http().post('/api/business-profiles')).send({
        label: 'Other',
        stateCode: '27',
      });
      await authed(t.http().post(`/api/business-profiles/${b.id}/default`));
      const updates = (await rows()).filter((r) => r.action === 'UPDATED');
      expect(updates.map((u) => [u.entity_id, u.diff])).toEqual([
        [a.id, { isDefault: { from: true, to: false } }],
        [b.id, { isDefault: { from: false, to: true } }],
      ]);
    });

    it('is rolled back together with a failed change', async () => {
      const svc = t.app.get(BusinessProfilesService);
      await expect(
        t.ds.transaction(async (m) => {
          await m.getRepository(BusinessProfile).save(
            m.getRepository(BusinessProfile).create({
              label: 'Doomed',
              stateCode: '07',
              invoicePrefix: 'SJ',
              isDefault: false,
            }),
          );
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await rows()).toEqual([]);
      expect(svc).toBeDefined();
    });
  });

  describe('who did it', () => {
    it('is SYSTEM outside requests, and whoever runAs names for background jobs and AI', async () => {
      expect(currentActor()).toEqual({ type: 'SYSTEM', id: null });
      const svc = t.app.get(BusinessProfilesService);
      const { id } = await runAs({ type: 'AI', id: 'ai-call-1' }, () =>
        svc.create({ label: 'From AI' }, ownerId),
      );
      await t.app
        .get(AuditService)
        .runAs({ type: 'SYSTEM', id: 'expiry-job' }, () =>
          svc.update(id, { brandName: 'Changed by a job' }),
        );
      expect((await rows()).map((r) => [r.actor_type, r.actor_id, r.action])).toEqual([
        ['AI', null, 'CREATED'],
        ['SYSTEM', null, 'UPDATED'],
      ]);
    });

    it('keeps concurrent requests apart', async () => {
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          authed(t.http().post('/api/business-profiles')).send({ label: `P${i}`, stateCode: '27' }),
        ),
      );
      const all = await rows();
      expect(all).toHaveLength(5);
      expect(all.every((r) => r.actor_type === 'USER' && r.actor_id === ownerId)).toBe(true);
    });
  });

  describe('GET /api/audit', () => {
    it('needs login', async () => {
      await t.http().get('/api/audit').expect(401);
    });

    it('lists newest first with a readable actor, filters by record, and pages', async () => {
      const { body: p } = await authed(t.http().post('/api/business-profiles')).send({
        brandName: 'A',
      });
      for (const name of ['B', 'C', 'D'])
        await authed(t.http().patch(`/api/business-profiles/${p.id}`)).send({ brandName: name });
      await t.app
        .get(AuditService)
        .record({ entity: 'operator', entityId: 'x', action: 'EXPIRY_ALERT' });

      const all = (await authed(t.http().get('/api/audit')).expect(200)).body;
      expect(all.items[0]).toMatchObject({ entity: 'operator', actorLabel: 'System' });
      expect(all.items[1]).toMatchObject({
        action: 'UPDATED',
        actorLabel: 'Owner',
        diff: { brandName: { from: 'C', to: 'D' } },
      });

      const page1 = (
        await authed(
          t.http().get(`/api/audit?entity=business_profile&entityId=${p.id}&limit=2`),
        ).expect(200)
      ).body;
      expect(page1.items).toHaveLength(2);
      expect(page1.nextBefore).toBeTruthy();
      const page2 = (
        await authed(
          t
            .http()
            .get(
              `/api/audit?entity=business_profile&entityId=${p.id}&limit=2&before=${page1.nextBefore}`,
            ),
        ).expect(200)
      ).body;
      expect(page2.items.map((i: { action: string }) => i.action)).toEqual(['UPDATED', 'CREATED']);
      expect(page2.nextBefore).toBeNull();
    });

    it('rejects odd filters', async () => {
      await authed(t.http().get('/api/audit?entity=DROP%20TABLE')).expect(400);
    });
  });
});
