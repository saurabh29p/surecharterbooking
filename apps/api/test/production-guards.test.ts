import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { SEED_OWNER, assertSeedAllowed, isDemoEmail, seed } from '../src/db/seed-data.js';
import {
  OWNER_EMAIL,
  authService,
  createOwner,
  createTestApp,
  resetLimits,
  type TestApp,
} from './app.js';
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

  describe('automated test account (TEST_ACCOUNT_*)', () => {
    const EMAIL = 'checks@example.com';
    const PASS = 'robot flight rehearsal 2026';
    const login = (password = PASS) =>
      t.http().post('/api/auth/login').send({ email: EMAIL, password });

    it('is never created before the owner exists', async () => {
      await expect(authService(t).syncTestAccount(EMAIL, PASS)).rejects.toThrow(/owner account/);
    });

    it('is created as a separate STAFF login, refreshed, and disabled when the settings go', async () => {
      const ownerId = await createOwner(t.ds, { setupDone: true });
      expect(await authService(t).syncTestAccount(EMAIL, PASS)).toBe('ready');
      const ok = await login().expect(200);
      expect(ok.body.user).toMatchObject({ email: EMAIL, role: 'STAFF' });
      // A new password replaces the old one; still the same single account.
      expect(await authService(t).syncTestAccount(EMAIL, `${PASS} two`)).toBe('ready');
      await login().expect(401);
      await login(`${PASS} two`).expect(200);
      expect(
        await t.ds.query(`SELECT count(*)::int AS n FROM app_user WHERE email = $1`, [EMAIL]),
      ).toEqual([{ n: 1 }]);

      // Settings removed: disabled, and its session can't be refreshed.
      expect(await authService(t).syncTestAccount()).toBe('disabled');
      await login(`${PASS} two`).expect(401);
      expect(await authService(t).syncTestAccount()).toBe('none');
      // The owner is never touched.
      const [owner] = await t.ds.query(`SELECT disabled_at, role FROM app_user WHERE id = $1`, [
        ownerId,
      ]);
      expect(owner).toEqual({ disabled_at: null, role: 'OWNER' });
    });

    it('refuses an email that belongs to the owner', async () => {
      await createOwner(t.ds, { setupDone: true });
      await expect(authService(t).syncTestAccount(OWNER_EMAIL, PASS)).rejects.toThrow(
        /real account/,
      );
    });
  });
});
