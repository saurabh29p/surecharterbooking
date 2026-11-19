import { beforeEach, describe, expect, it, vi } from 'vitest';

let listener: ((s: unknown) => void) | null = null;
const api = vi.fn();
vi.mock('../src/api/client', () => ({
  api: (path: string) => api(path),
  onSessionChange: (fn: (s: unknown) => void) => {
    listener = fn;
    return () => undefined;
  },
}));

const { cachedApi, clearCache, prefetchApi, readCache } = await import('../src/api/cache');

describe('saved copy first, then fresh (instant screens)', () => {
  beforeEach(async () => {
    api.mockReset();
    await clearCache();
  });

  it('shows the saved copy at once, then the fresh answer', async () => {
    api.mockResolvedValueOnce({ n: 1 });
    const seen: [unknown, boolean][] = [];
    await cachedApi('/weddings?', (v, c) => seen.push([v, c]));
    expect(seen).toEqual([[{ n: 1 }, false]]); // nothing saved yet: only the network

    let release!: (v: unknown) => void;
    api.mockReturnValueOnce(new Promise((r) => (release = r)));
    const second: [unknown, boolean][] = [];
    const done = cachedApi('/weddings?', (v, c) => second.push([v, c]));
    await new Promise((r) => setTimeout(r, 0));
    expect(second).toEqual([[{ n: 1 }, true]]); // saved copy while the network is slow
    release({ n: 2 });
    await done;
    expect(second).toEqual([
      [{ n: 1 }, true],
      [{ n: 2 }, false],
    ]);
  });

  it('keeps the saved copy on screen when the network fails, and fails when there is none', async () => {
    api.mockResolvedValueOnce({ n: 1 });
    await prefetchApi('/today');
    api.mockRejectedValueOnce(new Error('offline'));
    const seen: unknown[] = [];
    expect(await cachedApi('/today', (v) => seen.push(v))).toEqual({ fromCacheOnly: true });
    expect(seen).toEqual([{ n: 1 }]);

    api.mockRejectedValueOnce(new Error('offline'));
    await expect(cachedApi('/partners?', () => undefined)).rejects.toThrow('offline');
  });

  it('forgets everything when the session ends', async () => {
    api.mockResolvedValueOnce({ secret: 'margins' });
    await prefetchApi('/today');
    expect(await readCache('/today')).toEqual({ secret: 'margins' });
    listener?.(null);
    await new Promise((r) => setTimeout(r, 0));
    expect(await readCache('/today')).toBeUndefined();
  });
});
