import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserService } from '../user/user.service.js';
import { OidcAuthGuard } from './oidc-auth.guard.js';
import { OidcJwksService } from './oidc-jwks.service.js';

function contextWithHeaders(headers: Record<string, string>): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

// None of these tests reach the point where OidcAuthGuard calls
// UserService.syncFromAuth (they all throw earlier), so an unimplemented
// stub is enough — it's never invoked.
const unusedUserService = {} as UserService;

describe('OidcAuthGuard (P2P-003)', () => {
  let guard: OidcAuthGuard;

  beforeEach(() => {
    guard = new OidcAuthGuard(new OidcJwksService(), unusedUserService);
  });

  it('rejects a request with no Authorization header (401)', async () => {
    const ctx = contextWithHeaders({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a non-Bearer Authorization header (401)', async () => {
    const ctx = contextWithHeaders({ authorization: 'Basic abc123' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when CENTRAL_LOGIN_OIDC_ISSUER is not configured (401)', async () => {
    const original = process.env.CENTRAL_LOGIN_OIDC_ISSUER;
    delete process.env.CENTRAL_LOGIN_OIDC_ISSUER;
    try {
      const ctx = contextWithHeaders({ authorization: 'Bearer sometoken' });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      if (original) process.env.CENTRAL_LOGIN_OIDC_ISSUER = original;
    }
  });

  it('rejects a token that fails verification (401)', async () => {
    process.env.CENTRAL_LOGIN_OIDC_ISSUER = 'https://central-login.example.test';
    const jwks = new OidcJwksService();
    vi.spyOn(jwks, 'getJwks').mockRejectedValue(new Error('discovery unreachable'));
    guard = new OidcAuthGuard(jwks, unusedUserService);

    const ctx = contextWithHeaders({ authorization: 'Bearer not-a-real-token' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
