/**
 * Talks to the API under /api (same site as the desk: Vite proxy in dev, Vercel rewrite in production),
 * so the refresh cookie is first-party. The access token lives only in memory.
 * On a 401 it refreshes once (one refresh shared by all requests in flight) and retries.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Field-by-field problems from the API, for inline form errors. */
    readonly fields: Record<string, string> = {},
    /** The whole error body (e.g. a `code` and details such as the gaps in cancellation terms). */
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface Session {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  setupCompleted: boolean;
}

type Listener = (session: Session | null) => void;

let accessToken: string | null = null;
let refreshing: Promise<Session | null> | null = null;
const listeners = new Set<Listener>();

export function onSessionChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setSession(session: Session | null) {
  accessToken = session?.accessToken ?? null;
  for (const fn of listeners) fn(session);
}

async function parseError(res: Response): Promise<ApiError> {
  let body: { message?: unknown; fields?: Record<string, string> } = {};
  try {
    body = await res.json();
  } catch {
    // not JSON
  }
  const message =
    typeof body.message === 'string'
      ? body.message
      : res.status >= 500
        ? 'Something went wrong on our side. Please try again.'
        : `Request failed (${res.status})`;
  return new ApiError(res.status, message, body.fields ?? {}, body as Record<string, unknown>);
}

async function rawFetch(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`/api${path}`, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your internet connection and try again.");
  }
}

/** Use the refresh cookie to get a new access token. Returns null when there is no valid session. */
export function refreshSession(): Promise<Session | null> {
  refreshing ??= (async () => {
    try {
      const res = await rawFetch('/auth/refresh', {
        method: 'POST',
        headers: { 'x-sj-client': 'desk' },
      });
      if (!res.ok) {
        setSession(null);
        return null;
      }
      const session = (await res.json()) as Session;
      setSession(session);
      return session;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Authenticated request (refreshing once on 401); returns the raw response, throwing ApiError when not OK. */
async function authedFetch(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<Response> {
  const { json, ...rest } = init;
  const build = (): RequestInit => {
    const headers = new Headers(rest.headers);
    if (json !== undefined) headers.set('content-type', 'application/json');
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    return { ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body };
  };
  let res = await rawFetch(path, build());
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    const session = await refreshSession();
    if (session) res = await rawFetch(path, build());
  }
  if (!res.ok) throw await parseError(res);
  return res;
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const res = await authedFetch(path, init);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** A file that needs login, as a Blob with its file name (for sharing or opening a PDF). */
export async function fetchFile(
  path: string,
  fallbackName: string,
): Promise<{ blob: Blob; name: string }> {
  const res = await authedFetch(path);
  const disposition = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  return { blob: await res.blob(), name };
}

/** Download a file that needs login (CSV templates and exports) and save it on the device. */
export async function download(path: string, fallbackName: string): Promise<void> {
  const res = await authedFetch(path);
  const disposition = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function login(email: string, password: string): Promise<Session> {
  const session = await api<Session>('/auth/login', { method: 'POST', json: { email, password } });
  setSession(session);
  return session;
}

export async function logout(): Promise<void> {
  try {
    await rawFetch('/auth/logout', { method: 'POST', headers: { 'x-sj-client': 'desk' } });
  } finally {
    setSession(null);
  }
}

export async function logoutAllDevices(): Promise<void> {
  await api<void>('/auth/logout-all', { method: 'POST' });
  setSession(null);
}

/** After a password change the API returns a fresh session for this device. */
export function adoptSession(session: Session): void {
  setSession(session);
}
