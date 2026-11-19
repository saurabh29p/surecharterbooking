import { api, onSessionChange } from './client';

/**
 * Show the last data at once, then refresh it (UX.md §4: "cache recent data so screens open instantly").
 *
 * Lists (Today, weddings, partners, operators, clients) are kept in memory and in this phone's
 * IndexedDB, so a screen opens with what it showed last time while the network catches up. Only list
 * views are cached, never bank details or guest IDs, and everything is wiped when the session ends
 * (log out, "log out all devices", or an expired login).
 */
const DB = 'sj-cache';
const STORE = 'responses';
const VERSION = 1;
/** Older than this and it's not worth showing (the network will be quicker to trust). */
const MAX_AGE_MS = 7 * 24 * 3600_000;

interface Entry {
  at: number;
  value: unknown;
}

const memory = new Map<string, Entry>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idb<T>(
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest,
): Promise<T | undefined> {
  const d = await db();
  if (!d) return undefined;
  return new Promise((resolve) => {
    try {
      const req = run(d.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function readCache<T>(key: string): Promise<T | undefined> {
  const hit = memory.get(key) ?? (await idb<Entry>('readonly', (s) => s.get(key)));
  if (!hit || Date.now() - hit.at > MAX_AGE_MS) return undefined;
  memory.set(key, hit);
  return hit.value as T;
}

export function writeCache(key: string, value: unknown): void {
  const entry = { at: Date.now(), value };
  memory.set(key, entry);
  void idb('readwrite', (s) => s.put(entry, key));
}

export async function clearCache(): Promise<void> {
  memory.clear();
  await idb('readwrite', (s) => s.clear());
}

onSessionChange((s) => {
  if (!s) void clearCache();
});

/**
 * Fetch `path`, handing `apply` the cached copy first (if there is one and the network hasn't
 * answered yet) and then the fresh one. Rejects only when the network fails and there was nothing
 * cached to show; with a cached copy on screen, a failed refresh is reported by the second argument.
 */
export async function cachedApi<T>(
  path: string,
  apply: (value: T, fromCache: boolean) => void,
): Promise<{ fromCacheOnly: boolean }> {
  let fresh = false;
  let shownCached = false;
  const network = api<T>(path).then((v) => {
    fresh = true;
    writeCache(path, v);
    return v;
  });
  const cached = await readCache<T>(path);
  if (cached !== undefined && !fresh) {
    apply(cached, true);
    shownCached = true;
  }
  try {
    apply(await network, false);
    return { fromCacheOnly: false };
  } catch (e) {
    if (shownCached) return { fromCacheOnly: true };
    throw e;
  }
}

/** Warm the cache without showing anything (used to prefetch the next likely screens). */
export async function prefetchApi(path: string): Promise<void> {
  try {
    writeCache(path, await api(path));
  } catch {
    // Prefetching is best effort.
  }
}
