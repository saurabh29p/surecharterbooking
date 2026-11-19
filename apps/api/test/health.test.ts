import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createTestApp, type TestApp } from './app.js';

describe('health', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('compresses larger answers, but never login or session answers', async () => {
    // A public endpoint with a large enough body: the not-found page for a share link.
    const page = await t.http().get('/api/s/no-such-token').set('accept-encoding', 'gzip, br');
    expect(page.headers['content-encoding']).toMatch(/gzip|br/);
    const login = await t
      .http()
      .post('/api/auth/login')
      .set('accept-encoding', 'gzip, br')
      .send({ email: 'nobody@example.com', password: 'x'.repeat(2000) });
    expect(login.headers['content-encoding']).toBeUndefined();
  });

  it('GET /api/health is public and reports the database and IST time', async () => {
    const res = await t.http().get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'ok' });
    expect(res.body.timeIst).toMatch(/IST$/);
  });
});

describe('config', () => {
  const base = {
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(32),
    DATA_ENCRYPTION_KEYS: `k1:${Buffer.alloc(32, 1).toString('base64')}`,
  };

  const s3 = {
    STORAGE_DRIVER: 's3',
    S3_ENDPOINT: 'https://t3.storageapi.dev',
    S3_BUCKET: 'my-bucket',
    S3_ACCESS_KEY_ID: 'key',
    S3_SECRET_ACCESS_KEY: 'secret',
  };

  it('applies defaults', () => {
    const config = loadConfig(base);
    expect(config.API_PORT).toBe(3000);
    expect(config.COOKIE_SECURE).toBe(false);
    const prod = {
      ...base,
      NODE_ENV: 'production',
      DESK_ORIGIN: 'https://app.example.test',
      ...s3,
    };
    expect(loadConfig(prod).COOKIE_SECURE).toBe(true);
    // The host's PORT is used when API_PORT isn't set.
    expect(loadConfig({ ...base, PORT: '8080' }).API_PORT).toBe(8080);
    // Share links need the desk's real address in production.
    expect(() => loadConfig({ ...prod, DESK_ORIGIN: 'http://localhost:5173' })).toThrow(
      /DESK_ORIGIN: must be the desk's https address in production/,
    );
    expect(
      loadConfig({
        ...prod,
        DESK_ORIGIN: 'http://localhost:5173',
        PUBLIC_BASE_URL: 'https://app.example.test',
      }).PUBLIC_BASE_URL,
    ).toBe('https://app.example.test');
    expect(config.STORAGE_DRIVER).toBe('local');
  });

  it('needs every S3 setting for the bucket driver, and refuses local disk in production', () => {
    const c = loadConfig({ ...base, ...s3 });
    expect(c).toMatchObject({
      S3_REGION: 'auto',
      S3_FORCE_PATH_STYLE: false,
      S3_BUCKET: 'my-bucket',
    });
    expect(() =>
      loadConfig({ ...base, STORAGE_DRIVER: 's3', S3_ENDPOINT: 'https://t3.storageapi.dev' }),
    ).toThrow(
      /S3_BUCKET: required[\s\S]*S3_ACCESS_KEY_ID: required[\s\S]*S3_SECRET_ACCESS_KEY: required/,
    );
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', DESK_ORIGIN: 'https://app.example.test' }),
    ).toThrow(/STORAGE_DRIVER: must be s3 in production/);
  });

  it('parses rotation keys, newest first', () => {
    const old = Buffer.alloc(32, 2).toString('base64');
    const config = loadConfig({
      ...base,
      DATA_ENCRYPTION_KEYS: `${base.DATA_ENCRYPTION_KEYS},k0:${old}`,
    });
    expect(config.DATA_ENCRYPTION_KEYS.map((k) => k.id)).toEqual(['k1', 'k0']);
  });

  it('explains invalid values', () => {
    expect(() => loadConfig({ ...base, API_PORT: 'abc' })).toThrow(/API_PORT/);
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...base, DATA_ENCRYPTION_KEYS: 'k1:dG9vc2hvcnQ=' })).toThrow(
      /DATA_ENCRYPTION_KEYS/,
    );
    expect(() => loadConfig({ JWT_SECRET: 'x'.repeat(32) })).toThrow(/DATABASE_URL/);
  });
});
