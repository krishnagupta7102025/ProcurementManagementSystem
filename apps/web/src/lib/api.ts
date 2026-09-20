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
