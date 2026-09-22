import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthGuard } from './auth.guard.js';
import { signSessionToken } from './jwt.util.js';

function contextWithHeaders(headers: Record<string, string>): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const guard = new AuthGuard();

  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = 'test-secret-value-not-used-anywhere-real';
  });

  afterEach(() => {
    delete process.env.AUTH_JWT_SECRET;
  });

  it('rejects a request with no Authorization header (401)', async () => {
    const ctx = contextWithHeaders({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a non-Bearer Authorization header (401)', async () => {
    const ctx = contextWithHeaders({ authorization: 'Basic abc123' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a garbage token (401)', async () => {
    const ctx = contextWithHeaders({ authorization: 'Bearer not-a-real-token' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token signed with a different secret (401)', async () => {
    const token = await signSessionToken({
      sub: 'user-1',
      orgId: 'org-1',
      email: 'a@demo.p2p',
      displayName: 'A',
      roles: ['ADMIN'],
    });
    process.env.AUTH_JWT_SECRET = 'a-different-secret-entirely';
    const ctx = contextWithHeaders({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a valid session token and attaches the decoded claims to the request', async () => {
    const token = await signSessionToken({
      sub: 'user-1',
      orgId: 'org-1',
      email: 'buyer@demo.p2p',
      displayName: 'Bella Buyer',
      roles: ['BUYER'],
    });

    const request = { headers: { authorization: `Bearer ${token}` } } as unknown as Record<string, unknown> & {
      user?: unknown;
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect((request as { user: { localUserId: string; roles: string[] } }).user).toEqual({
      localUserId: 'user-1',
      orgId: 'org-1',
      email: 'buyer@demo.p2p',
      displayName: 'Bella Buyer',
      roles: ['BUYER'],
    });
  });
});
