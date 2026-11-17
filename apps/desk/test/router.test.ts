import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { USER, mockFetch, session } from './fetch-mock';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

async function routerWith(refresh: { status: number; body?: unknown }) {
  mockFetch((url) => (url === '/api/auth/refresh' ? refresh : { status: 200, body: [] }));
  const { makeRouter } = await import('../src/router');
  return makeRouter(createMemoryHistory());
}

describe('router guards', () => {
  it('sends logged-out visitors to login, remembering where they were going', async () => {
    const router = await routerWith({ status: 401 });
    await router.push('/settings');
    expect(router.currentRoute.value.fullPath).toBe('/login?next=/settings');
  });

  it('restores the 30-day session silently on app start', async () => {
    const router = await routerWith({ status: 200, body: session('A') });
    await router.push('/settings');
    expect(router.currentRoute.value.path).toBe('/settings');
  });

  it('sends a user who has not finished setup to the setup wizard', async () => {
    const router = await routerWith({
      status: 200,
      body: session('A', { ...USER, setupCompleted: false }),
    });
    await router.push('/');
    expect(router.currentRoute.value.path).toBe('/setup');
  });

  it('skips the login page when already logged in', async () => {
    const router = await routerWith({ status: 200, body: session('A') });
    await router.push('/login');
    expect(router.currentRoute.value.path).toBe('/');
  });
});
