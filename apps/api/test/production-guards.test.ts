import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { SEED_OWNER, assertSeedAllowed, isDemoEmail, seed } from '../src/db/seed-data.js';
import { authService, createOwner, createTestApp, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

describe('production guards', () => {
  let t: TestApp;
  let config: AppConfig;

  beforeAll(async () => {
    t = await createTestApp();
    config = t.app.get<AppConfig>(APP_CONFIG);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
  });
  afterEach(() => {
    config.NODE_ENV = 'test';
  });

  it('recognises demo emails by the reserved .test domain', () => {
    expect(isDemoEmail(SEED_OWNER.email)).toBe(true);
    expect(isDemoEmail('planner@example.test')).toBe(true);
    expect(isDemoEmail('owner@shubhjets.com')).toBe(false);
    expect(isDemoEmail('someone@test.in')).toBe(false);
  });

  describe('pnpm seed', () => {
    it('refuses when NODE_ENV is production', async () => {
      await expect(assertSeedAllowed(t.ds, { NODE_ENV: 'production' })).rejects.toThrow(
        /NODE_ENV is production/,
      );
    });

    it('refuses on a database with real accounts, unless forced', async () => {
      await t.ds.query(
        `INSERT INTO app_user (email, password_hash) VALUES ('me@shubhjets.com', 'x')`,
      );
      await expect(assertSeedAllowed(t.ds, { NODE_ENV: 'development' })).rejects.toThrow(
        /real accounts \(me@shubhjets.com\)/,
      );
      await expect(
        assertSeedAllowed(t.ds, { NODE_ENV: 'development' }, { force: true }),
      ).resolves.toBeUndefined();
      // --force never overrides production.
      await expect(
        assertSeedAllowed(t.ds, { NODE_ENV: 'production' }, { force: true }),
      ).rejects.toThrow(/production/);
    });

    it('runs on an empty or demo-only database', async () => {
      await expect(assertSeedAllowed(t.ds, { NODE_ENV: 'development' })).resolves.toBeUndefined();
      await seed(t.ds, t.app.get(EncryptionService));
      await expect(assertSeedAllowed(t.ds, { NODE_ENV: 'development' })).resolves.toBeUndefined();
    });
  });

  describe('API in production', () => {
    it('rejects the demo login even with the right password', async () => {
      await seed(t.ds, t.app.get(EncryptionService));
      resetLimits(t);
      config.NODE_ENV = 'production';
      const res = await t.http().post('/api/auth/login').send(SEED_OWNER).expect(401);
      expect(res.body.message).toBe('Wrong email or password');
    });

    it('disables demo accounts found at boot, and leaves real ones alone', async () => {
      await seed(t.ds, t.app.get(EncryptionService));
      await createOwner(t.ds); // owner@example.test is also a demo address
      await t.ds.query(
        `INSERT INTO app_user (email, password_hash) VALUES ('me@shubhjets.com', 'x')`,
      );
      config.NODE_ENV = 'production';
      const disabled = await authService(t).disableDemoAccounts();
      expect(disabled.sort()).toEqual(['owner@example.test', SEED_OWNER.email]);
      const rows: { email: string; disabled: boolean }[] = await t.ds.query(
        `SELECT email, disabled_at IS NOT NULL AS disabled FROM app_user ORDER BY email`,
      );
      expect(rows.find((r) => r.email === 'me@shubhjets.com')!.disabled).toBe(false);
      const [audit] = await t.ds.query(
        `SELECT count(*)::int AS n FROM audit_log WHERE action = 'DEMO_ACCOUNT_DISABLED'`,
      );
      expect(audit.n).toBe(2);
    });

    it('refuses a .test ADMIN_EMAIL', async () => {
      config.NODE_ENV = 'production';
      await expect(
        authService(t).bootstrapAdmin('owner@shubhjets.test', 'a perfectly fine passphrase'),
      ).rejects.toThrow(/real email/);
    });
  });
});
