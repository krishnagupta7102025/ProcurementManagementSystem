import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesGuard } from './roles.guard.js';

function contextWithUser(roles: string[] | undefined): ExecutionContext {
  const request = { user: roles ? { roles } : undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard (P2P-003)', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows the request when the route declares no required roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextWithUser(undefined))).toBe(true);
  });

  it('rejects a user missing every required role (403)', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(contextWithUser(['REQUESTER']))).toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated user at all (403)', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(ForbiddenException);
  });

  it('allows a user who has one of the required roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'CONTROLLER']);
    expect(guard.canActivate(contextWithUser(['CONTROLLER']))).toBe(true);
  });
});
