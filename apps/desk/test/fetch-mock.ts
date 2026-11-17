import { vi } from 'vitest';

type Handler = (url: string, init: RequestInit) => { status: number; body?: unknown };

/** Replace global fetch with a router of fake API responses; returns the list of calls made. */
export function mockFetch(handler: Handler) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const { status, body } = handler(url, init);
      return new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return calls;
}

export const USER = {
  id: 'u1',
  email: 'owner@example.test',
  name: 'Owner',
  role: 'OWNER',
  setupCompleted: true,
};
export const session = (token: string, user = USER) => ({
  accessToken: token,
  expiresIn: 900,
  user,
});
