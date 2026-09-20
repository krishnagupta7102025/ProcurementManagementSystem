import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
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
  let prismaStub: { user: { findFirst: ReturnType<typeof vi.fn> } };

  // This machine's own apps/api/.env sets DEV_AUTH_BYPASS=true for local
  // testing (see docs/99-build-guide.md) — clear it before each test too,
  // not just after, so the tests above the "DEV_AUTH_BYPASS" describe
  // block below reliably exercise the real-JWT path they're named for,
  // rather than coincidentally converging on the same exception via the
  // bypass path instead.
  beforeEach(() => {
    delete process.env.DEV_AUTH_BYPASS;
    delete process.env.NODE_ENV;
    prismaStub = { user: { findFirst: vi.fn() } };
    guard = new OidcAuthGuard(new OidcJwksService(), unusedUserService, prismaStub as unknown as PrismaService);
  });

  afterEach(() => {
    delete process.env.DEV_AUTH_BYPASS;
    delete process.env.NODE_ENV;
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
    guard = new OidcAuthGuard(jwks, unusedUserService, prismaStub as unknown as PrismaService);

    const ctx = contextWithHeaders({ authorization: 'Bearer not-a-real-token' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe('DEV_AUTH_BYPASS (local testing only)', () => {
    it('authenticates as the user named in the x-dev-user-email header, with no token required', async () => {
      process.env.DEV_AUTH_BYPASS = 'true';
      process.env.NODE_ENV = 'development';
      prismaStub.user.findFirst.mockResolvedValue({
        id: 'user-1',
        centralLoginId: 'demo-buyer',
        email: 'buyer@demo.p2p',
        displayName: 'Bella Buyer',
        orgId: 'org-1',
        roles: ['BUYER'],
      });

      const request = { headers: { 'x-dev-user-email': 'buyer@demo.p2p' } } as unknown as Record<string, unknown> & {
        user?: unknown;
      };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(ctx);
      expect(result).toBe(true);
      expect(prismaStub.user.findFirst).toHaveBeenCalledWith({ where: { email: 'buyer@demo.p2p' } });
      expect((request as { user: { localUserId: string } }).user.localUserId).toBe('user-1');
    });

    it('falls back to the default demo admin email when no header is given', async () => {
      process.env.DEV_AUTH_BYPASS = 'true';
      process.env.NODE_ENV = 'development';
      prismaStub.user.findFirst.mockResolvedValue({
        id: 'admin-1',
        centralLoginId: 'demo-admin',
        email: 'admin@demo.p2p',
        displayName: 'Ada Admin',
        orgId: 'org-1',
        roles: ['ADMIN'],
      });

      const ctx = contextWithHeaders({});
      await guard.canActivate(ctx);
      expect(prismaStub.user.findFirst).toHaveBeenCalledWith({ where: { email: 'admin@demo.p2p' } });
    });

    it('rejects when no user matches the requested email (401)', async () => {
      process.env.DEV_AUTH_BYPASS = 'true';
      process.env.NODE_ENV = 'development';
      prismaStub.user.findFirst.mockResolvedValue(null);

      const ctx = contextWithHeaders({ 'x-dev-user-email': 'nobody@demo.p2p' });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('never activates when NODE_ENV=production, even if DEV_AUTH_BYPASS=true', async () => {
      process.env.DEV_AUTH_BYPASS = 'true';
      process.env.NODE_ENV = 'production';

      // No Authorization header — if the bypass were (wrongly) active this
      // would succeed via prismaStub; instead it must hit the real 401 path.
      const ctx = contextWithHeaders({});
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prismaStub.user.findFirst).not.toHaveBeenCalled();
    });
  });
});
