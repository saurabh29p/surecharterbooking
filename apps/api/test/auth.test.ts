import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { passwordProblem } from '../src/auth/password.js';
import {
  OWNER_EMAIL,
  OWNER_PASSWORD,
  authService,
  createOwner,
  createTestApp,
  login,
  refreshCookie,
  resetLimits,
  type TestApp,
} from './app.js';
import { resetDb } from './db.js';

const DAY = 24 * 60 * 60 * 1000;

describe('auth', () => {
  let t: TestApp;
  let ownerId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.ds);
    ownerId = await createOwner(t.ds);
    authService(t).now = () => new Date();
    resetLimits(t);
  });

  const refresh = (cookie: string) =>
    t.http().post('/api/auth/refresh').set('x-sj-client', 'desk').set('cookie', cookie);

  describe('login', () => {
    it('returns an access token and a 30-day httpOnly, SameSite=Strict refresh cookie', async () => {
      const res = await t
        .http()
        .post('/api/auth/login')
        .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
        .expect(200);
      expect(res.body.accessToken).toBeTypeOf('string');
      expect(res.body.user).toMatchObject({ email: OWNER_EMAIL, setupCompleted: false });
      expect(res.body.refreshToken).toBeUndefined(); // only ever in the cookie
      const raw = ([] as string[])
        .concat(res.headers['set-cookie'] as string | string[])
        .find((c) => c.startsWith('sj_refresh='))!;
      expect(raw).toMatch(/HttpOnly/i);
      expect(raw).toMatch(/SameSite=Strict/i);
      expect(raw).toMatch(/Path=\/api\/auth/);
      expect(raw).toMatch(/Max-Age=2592000/); // 30 days
    });

    it('accepts the email in any case', async () => {
      await t
        .http()
        .post('/api/auth/login')
        .send({ email: OWNER_EMAIL.toUpperCase(), password: OWNER_PASSWORD })
        .expect(200);
    });

    it('gives the same answer for a wrong password and an unknown email', async () => {
      const wrong = await t
        .http()
        .post('/api/auth/login')
        .send({ email: OWNER_EMAIL, password: 'nope-nope-nope' })
        .expect(401);
      const unknown = await t
        .http()
        .post('/api/auth/login')
        .send({ email: 'x@example.test', password: 'nope-nope-nope' })
        .expect(401);
      expect(wrong.body.message).toBe('Wrong email or password');
      expect(unknown.body.message).toBe(wrong.body.message);
    });

    it('explains invalid input field by field', async () => {
      const res = await t
        .http()
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: '' })
        .expect(400);
      expect(res.body.fields).toMatchObject({
        email: 'Enter a valid email',
        password: 'Enter your password',
      });
    });

    it('locks the email after 8 wrong passwords, even with the right one', async () => {
      for (let i = 0; i < 8; i++) {
        await t
          .http()
          .post('/api/auth/login')
          .set('x-forwarded-for', `10.0.0.${i}`)
          .send({ email: OWNER_EMAIL, password: `wrong-${i}-xxxxxx` });
      }
      const res = await t
        .http()
        .post('/api/auth/login')
        .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
        .expect(429);
      expect(res.body.message).toMatch(/Try again in \d+ minutes?/);
    });

    it('throttles login attempts from one network (10 per 15 minutes)', async () => {
      for (let i = 0; i < 10; i++) {
        await t
          .http()
          .post('/api/auth/login')
          .send({ email: `user${i}@example.test`, password: 'whatever-whatever' })
          .expect(401);
      }
      const res = await t
        .http()
        .post('/api/auth/login')
        .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
        .expect(429);
      expect(res.body.message).toMatch(/Too many requests/);
    });

    it('records logins and failures in the audit log without secrets', async () => {
      await t
        .http()
        .post('/api/auth/login')
        .send({ email: OWNER_EMAIL, password: 'nope-nope-nope' });
      await login(t);
      const rows: { action: string; diff: unknown }[] = await t.ds.query(
        `SELECT action, diff FROM audit_log ORDER BY id`,
      );
      expect(rows.map((r) => r.action)).toEqual(['LOGIN_FAILED', 'LOGIN']);
      expect(JSON.stringify(rows)).not.toContain(OWNER_PASSWORD);
    });
  });

  describe('protected routes', () => {
    it('need a valid access token', async () => {
      await t.http().get('/api/auth/me').expect(401);
      await t.http().get('/api/auth/me').set('authorization', 'Bearer garbage').expect(401);
      const { accessToken } = await login(t);
      const me = await t
        .http()
        .get('/api/auth/me')
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(me.body).toMatchObject({ id: ownerId, email: OWNER_EMAIL });
    });

    it('marks first-login setup as done', async () => {
      const { accessToken } = await login(t);
      const res = await t
        .http()
        .post('/api/auth/setup-complete')
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.setupCompleted).toBe(true);
    });
  });

  describe('refresh (30-day phone session)', () => {
    it('rotates the refresh token and issues a working access token', async () => {
      const { cookie } = await login(t);
      const res = await refresh(cookie).expect(200);
      const next = refreshCookie(res)!;
      expect(next).not.toBe(cookie);
      await t
        .http()
        .get('/api/auth/me')
        .set('authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
    });

    it('requires the desk client header (CSRF defence)', async () => {
      const { cookie } = await login(t);
      await t.http().post('/api/auth/refresh').set('cookie', cookie).expect(403);
    });

    it('stays logged in as long as the phone is used at least every 30 days', async () => {
      const auth = authService(t);
      const start = Date.now();
      const { cookie } = await login(t);
      auth.now = () => new Date(start + 29 * DAY);
      const r1 = await refresh(cookie).expect(200);
      auth.now = () => new Date(start + 58 * DAY);
      await refresh(refreshCookie(r1)!).expect(200);
    });

    it('expires after 30 days without use', async () => {
      const auth = authService(t);
      const start = Date.now();
      const { cookie } = await login(t);
      auth.now = () => new Date(start + 31 * DAY);
      const res = await refresh(cookie).expect(401);
      expect(res.body.message).toMatch(/expired/);
    });

    it('tolerates a parallel refresh with the just-rotated token without ending the session', async () => {
      const { cookie } = await login(t);
      const r1 = await refresh(cookie).expect(200);
      await refresh(cookie).expect(401); // the other tab's late request
      await refresh(refreshCookie(r1)!).expect(200); // session still alive
    });

    it('ends the whole device session if an old token is replayed later (theft)', async () => {
      const auth = authService(t);
      const start = Date.now();
      const { cookie } = await login(t);
      const r1 = await refresh(cookie).expect(200);
      auth.now = () => new Date(start + 60_000);
      await refresh(cookie).expect(401);
      await refresh(refreshCookie(r1)!).expect(401);
      const [row] = await t.ds.query(
        `SELECT count(*)::int AS n FROM audit_log WHERE action = 'SESSION_REUSE_DETECTED'`,
      );
      expect(row.n).toBe(1);
    });
  });

  describe('logging out', () => {
    it('logs out this device only', async () => {
      const phone = await login(t, 'phone');
      const laptop = await login(t, 'laptop');
      await t
        .http()
        .post('/api/auth/logout')
        .set('x-sj-client', 'desk')
        .set('cookie', phone.cookie)
        .expect(204);
      await refresh(phone.cookie).expect(401);
      await refresh(laptop.cookie).expect(200);
    });

    it('"log out all devices" ends every session and every access token at once', async () => {
      const phone = await login(t, 'phone');
      const laptop = await login(t, 'laptop');
      await t
        .http()
        .post('/api/auth/logout-all')
        .set('authorization', `Bearer ${phone.accessToken}`)
        .expect(204);
      await refresh(phone.cookie).expect(401);
      await refresh(laptop.cookie).expect(401);
      // Access tokens are short-lived, but they stop working immediately too.
      await t
        .http()
        .get('/api/auth/me')
        .set('authorization', `Bearer ${laptop.accessToken}`)
        .expect(401);
      // Logging in again works.
      await login(t, 'phone');
    });

    it('lists signed-in devices and can log one out', async () => {
      const phone = await login(t, 'Phone (Android)');
      await login(t, 'Laptop (Mac)');
      const list = await t
        .http()
        .get('/api/auth/sessions')
        .set('authorization', `Bearer ${phone.accessToken}`)
        .set('cookie', phone.cookie)
        .expect(200);
      expect(list.body).toHaveLength(2);
      const current = list.body.find((s: { current: boolean }) => s.current);
      expect(current.userAgent).toBe('Phone (Android)');
      const laptop = list.body.find((s: { current: boolean }) => !s.current);
      await t
        .http()
        .delete(`/api/auth/sessions/${laptop.id}`)
        .set('authorization', `Bearer ${phone.accessToken}`)
        .expect(204);
      const after = await t
        .http()
        .get('/api/auth/sessions')
        .set('authorization', `Bearer ${phone.accessToken}`)
        .expect(200);
      expect(after.body).toHaveLength(1);
    });
  });

  describe('changing the password', () => {
    it('checks the current password and the strength of the new one', async () => {
      const { accessToken } = await login(t);
      const bad = await t
        .http()
        .post('/api/auth/password')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'wrong', newPassword: 'a much longer passphrase' })
        .expect(400);
      expect(bad.body.fields.currentPassword).toBeDefined();
      const weak = await t
        .http()
        .post('/api/auth/password')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: OWNER_PASSWORD, newPassword: 'short' })
        .expect(400);
      expect(weak.body.fields.newPassword).toMatch(/12 characters/);
    });

    it('logs out other devices but keeps this one', async () => {
      const phone = await login(t, 'phone');
      const laptop = await login(t, 'laptop');
      const res = await t
        .http()
        .post('/api/auth/password')
        .set('authorization', `Bearer ${phone.accessToken}`)
        .set('cookie', phone.cookie)
        .send({ currentPassword: OWNER_PASSWORD, newPassword: 'a brand new long passphrase' })
        .expect(200);
      await t
        .http()
        .get('/api/auth/me')
        .set('authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
      await refresh(refreshCookie(res)!).expect(200);
      await refresh(laptop.cookie).expect(401);
      await t
        .http()
        .post('/api/auth/login')
        .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
        .expect(401);
    });
  });

  describe('owner from environment', () => {
    it('creates the owner once, and refuses weak passwords', async () => {
      await resetDb(t.ds);
      const auth = authService(t);
      await expect(auth.bootstrapAdmin('me@example.test', 'short')).rejects.toThrow(
        /ADMIN_PASSWORD/,
      );
      await expect(
        auth.bootstrapAdmin('me@example.test', 'change-me-to-a-long-passphrase'),
      ).rejects.toThrow(/too common/);
      expect(await auth.bootstrapAdmin('me@example.test', 'a perfectly fine passphrase')).toBe(
        'created',
      );
      expect(await auth.bootstrapAdmin('other@example.test', 'a perfectly fine passphrase')).toBe(
        'exists',
      );
      const [row] = await t.ds.query(`SELECT count(*)::int AS n FROM app_user`);
      expect(row.n).toBe(1);
    });
  });
});

describe('password rules', () => {
  it('explains what is wrong in plain words', () => {
    expect(passwordProblem('short')).toMatch(/12 characters/);
    expect(passwordProblem('aaaaaaaaaaaaaa')).toMatch(/repeated/);
    expect(passwordProblem('rahul-wedding-2026', 'rahul@example.com')).toMatch(/email/);
    expect(passwordProblem('a long and fine passphrase')).toBeNull();
  });
});
