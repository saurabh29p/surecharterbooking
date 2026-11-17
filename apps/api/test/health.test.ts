import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { loadConfig } from '../src/config.js';

describe('API skeleton', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health reports ok with IST time', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timeIst).toMatch(/IST$/);
  });
});

describe('config', () => {
  const base = {
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(32),
    DATA_ENCRYPTION_KEYS: `k1:${Buffer.alloc(32, 1).toString('base64')}`,
  };

  it('applies defaults', () => {
    const config = loadConfig(base);
    expect(config.API_PORT).toBe(3000);
    expect(config.COOKIE_SECURE).toBe(false);
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true);
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
