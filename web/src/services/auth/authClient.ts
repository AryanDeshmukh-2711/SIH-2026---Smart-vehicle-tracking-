/**
 * Operator auth client.
 *
 * Tokens live in localStorage. That is a deliberate, bounded trade: it survives
 * a reload, which matters when a driver's phone locks mid-shift, at the cost of
 * being readable by any script that gets injected. The mitigations are a short
 * access-token life, rotation on refresh, and the fact that the passenger app —
 * the only part with third-party surface area — never authenticates at all.
 */

export type Role = 'passenger' | 'driver' | 'depot_manager' | 'admin' | 'transport_authority';

export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  depot: string | null;
}

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

const STORAGE_KEY = 'himgati.session';

function read(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function write(session: StoredSession | null): void {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(STORAGE_KEY);
}

export const session = { read, clear: () => write(null) };

/* --------------------------------- errors --------------------------------- */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as
    | { data: T; error: { message: string } | null }
    | null;

  if (!res.ok) throw new ApiError(body?.error?.message ?? `Request failed (${res.status})`, res.status);
  return body!.data;
}

/* ---------------------------------- login --------------------------------- */

export function requestOtp(identifier: string) {
  return fetch('/api/v1/auth/otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  }).then((r) => unwrap<{ sent: boolean; expiresInSec: number; devCode?: string }>(r));
}

export async function verifyOtp(identifier: string, code: string): Promise<SessionUser> {
  const data = await fetch('/api/v1/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, code }),
  }).then((r) => unwrap<StoredSession>(r));

  write(data);
  return data.user;
}

export async function loginWithPassword(
  identifier: string,
  password: string,
): Promise<SessionUser> {
  const data = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  }).then((r) => unwrap<StoredSession>(r));

  write(data);
  return data.user;
}

export async function logout(): Promise<void> {
  const current = read();
  write(null);
  if (!current) return;

  // Best effort — a failed revoke must not leave someone unable to sign out.
  await fetch('/api/v1/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: current.refreshToken }),
  }).catch(() => undefined);
}

/* ------------------------------ authed requests --------------------------- */

/** Single-flight, so a burst of 401s does not rotate the refresh token N times. */
let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const current = read();
  if (!current) return false;

  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!res.ok) {
        write(null);
        return false;
      }
      const body = (await res.json()) as { data: StoredSession };
      write(body.data);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

/**
 * Fetch with the access token attached, retrying once through a refresh.
 *
 * The retry is what makes a 15-minute access token invisible to the user: a
 * driver mid-shift never sees a session expire, they just keep tapping.
 */
export async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = () => {
    const current = read();
    return fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
        ...(current ? { Authorization: `Bearer ${current.accessToken}` } : {}),
      },
    });
  };

  let res = await send();

  if (res.status === 401 && (await refresh())) {
    res = await send();
  }

  return unwrap<T>(res);
}

export const api = {
  get: <T>(path: string) => authedFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    authedFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    authedFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => authedFetch<T>(path, { method: 'DELETE' }),
};
