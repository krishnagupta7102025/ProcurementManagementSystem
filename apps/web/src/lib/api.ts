const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export const TOKEN_STORAGE_KEY = 'p2p-auth-token';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

/** Set by AuthProvider on login/logout so a 401 here can force a fresh sign-in without every caller handling it. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/** Every call carries the logged-in user's session token (see auth-context.tsx) as a Bearer header. */
export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && token) {
    onUnauthorized?.();
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join('; ') : (data?.message ?? res.statusText);
    throw new ApiError(res.status, message);
  }

  return data as T;
}

/**
 * Fetches a file (PDF, etc.) from a URL a JSON response handed back — e.g.
 * StorageService.getDownloadUrl(). A plain `<a href>`/`window.open` can't
 * carry the session's Authorization header a normal browser navigation
 * needs, so callers fetch the bytes here and open them via a blob: URL
 * instead. The header is only attached when the URL points back at this
 * API (the local storage dev driver's own download route) — a real S3
 * presigned URL authenticates via its query-string signature and lives on
 * a different origin entirely, so it's fetched as-is.
 */
export async function fetchFileBlob(url: string): Promise<Blob> {
  const sameOrigin = url.startsWith(API_URL);
  const token = getToken();
  const res = await fetch(url, sameOrigin && token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  if (!res.ok) {
    throw new ApiError(res.status, res.statusText);
  }
  return res.blob();
}

/** Like fetchFileBlob, but for a path on this API directly (e.g. a CSV export endpoint) rather than a URL handed back in a JSON response. */
export async function apiFetchBlob(path: string): Promise<Blob> {
  return fetchFileBlob(`${API_URL}${path}`);
}
