const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  userEmail: string;
}

/**
 * Every call carries the x-dev-user-email header — this app only exists
 * to test the API against the local dev-auth-bypass (see
 * apps/api/src/auth/dev-auth-bypass.ts). There is no real sign-in.
 */
export async function apiFetch<T>(path: string, opts: ApiFetchOptions): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-dev-user-email': opts.userEmail,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

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
 * carry the x-dev-user-email header a normal browser navigation needs, so
 * callers fetch the bytes here and open them via a blob: URL instead. The
 * header is only attached when the URL points back at this API (the local
 * storage dev driver's own download route) — a real S3 presigned URL
 * authenticates via its query-string signature and lives on a different
 * origin entirely, so it's fetched as-is.
 */
export async function fetchFileBlob(url: string, userEmail: string): Promise<Blob> {
  const sameOrigin = url.startsWith(API_URL);
  const res = await fetch(url, sameOrigin ? { headers: { 'x-dev-user-email': userEmail } } : undefined);
  if (!res.ok) {
    throw new ApiError(res.status, res.statusText);
  }
  return res.blob();
}
