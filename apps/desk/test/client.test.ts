import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, session } from './fetch-mock';

// Fresh module state (in-memory token) for every test.
let client: typeof import('../src/api/client');
beforeEach(async () => {
  vi.resetModules();
  client = await import('../src/api/client');
});
afterEach(() => vi.unstubAllGlobals());

const auth = (init: RequestInit) => new Headers(init.headers).get('authorization');

describe('API client', () => {
  it('sends the access token after login', async () => {
    const calls = mockFetch((url) =>
      url === '/api/auth/login'
        ? { status: 200, body: session('A') }
        : { status: 200, body: { ok: 1 } },
    );
    await client.login('owner@example.test', 'pw');
    await client.api('/business-profiles');
    expect(auth(calls[1]!.init)).toBe('Bearer A');
  });

  it('refreshes once on 401 and retries the request', async () => {
    let fresh = false;
    const calls = mockFetch((url, init) => {
      if (url === '/api/auth/refresh') {
        fresh = true;
        return { status: 200, body: session('B') };
      }
      return auth(init) === 'Bearer B' && fresh
        ? { status: 200, body: [1] }
        : { status: 401, body: { message: 'expired' } };
    });
    await expect(client.api('/business-profiles')).resolves.toEqual([1]);
    expect(calls.map((c) => c.url)).toEqual([
      '/api/business-profiles',
      '/api/auth/refresh',
      '/api/business-profiles',
    ]);
    expect(new Headers(calls[1]!.init.headers).get('x-sj-client')).toBe('desk');
  });

  it('shares one refresh between parallel requests', async () => {
    const calls = mockFetch((url, init) => {
      if (url === '/api/auth/refresh') return { status: 200, body: session('C') };
      return auth(init) === 'Bearer C' ? { status: 200, body: {} } : { status: 401 };
    });
    await Promise.all([client.api('/a'), client.api('/b'), client.api('/c')]);
    expect(calls.filter((c) => c.url === '/api/auth/refresh')).toHaveLength(1);
  });

  it('ends the session when refresh fails', async () => {
    mockFetch(() => ({ status: 401, body: { message: 'Please log in' } }));
    const seen: unknown[] = [];
    client.onSessionChange((s) => seen.push(s));
    await expect(client.api('/x')).rejects.toMatchObject({ status: 401 });
    expect(seen).toEqual([null]);
  });

  it('passes field errors through for inline form messages', async () => {
    mockFetch(() => ({
      status: 400,
      body: { message: 'Please fix the highlighted fields', fields: { gstin: 'typo' } },
    }));
    await expect(
      client.api('/business-profiles', { method: 'POST', json: {} }),
    ).rejects.toMatchObject({
      status: 400,
      fields: { gstin: 'typo' },
    });
  });

  it('explains network failures in plain words', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(client.api('/x')).rejects.toThrow(/Check your internet connection/);
  });
});
