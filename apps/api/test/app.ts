import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getStorageToken, type ThrottlerStorageService } from '@nestjs/throttler';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AuthService } from '../src/auth/auth.service.js';
import { LoginLimiter } from '../src/auth/login-limiter.js';
import { hashPassword } from '../src/auth/password.js';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import { resetDb } from './db.js';

export const OWNER_EMAIL = 'owner@example.test';
export const OWNER_PASSWORD = 'correct horse battery staple';

export interface TestApp {
  app: NestExpressApplication;
  ds: DataSource;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/** Boots the real AppModule with the same setup as production, on an empty test database. */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app, app.get<AppConfig>(APP_CONFIG));
  await app.init();
  const ds = app.get<DataSource>(getDataSourceToken());
  await resetDb(ds);
  return { app, ds, http: () => request(app.getHttpServer()), close: () => app.close() };
}

/** Insert the owner directly (bypassing the env bootstrap) and return its id. */
export async function createOwner(
  ds: DataSource,
  opts: { setupDone?: boolean } = {},
): Promise<string> {
  const [row] = await ds.query(
    `INSERT INTO app_user (email, password_hash, name, role, setup_completed_at)
     VALUES ($1, $2, 'Owner', 'OWNER', $3) RETURNING id`,
    [OWNER_EMAIL, await hashPassword(OWNER_PASSWORD), opts.setupDone ? new Date() : null],
  );
  return row.id;
}

export function refreshCookie(res: { headers: Record<string, unknown> }): string | undefined {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  const cookie = list.find((c) => c.startsWith('sj_refresh='));
  return cookie?.split(';')[0];
}

/** Log in as the owner; returns the access token and the refresh cookie ("sj_refresh=..."). */
export async function login(t: TestApp, userAgent = 'test-phone') {
  const res = await t
    .http()
    .post('/api/auth/login')
    .set('user-agent', userAgent)
    .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
    .expect(200);
  return {
    accessToken: res.body.accessToken as string,
    cookie: refreshCookie(res)!,
    body: res.body,
  };
}

export function authService(t: TestApp): AuthService {
  return t.app.get(AuthService);
}

/** Forget rate-limit counters so each test starts fresh. */
export function resetLimits(t: TestApp): void {
  const storage = t.app.get<ThrottlerStorageService>(getStorageToken());
  storage.storage.clear();
  (storage as unknown as { hitExpirations: Map<string, unknown> }).hitExpirations.clear();
  const limiter = t.app.get(LoginLimiter);
  limiter.now = () => Date.now();
  (limiter as unknown as { failures: Map<string, number[]> }).failures.clear();
}
