import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { jwtVerify } from 'jose';
import type { Role } from '../generated/prisma/enums.js';
import { UserService } from '../user/user.service.js';
import type { AuthenticatedUser } from './auth.types.js';
import { OidcJwksService } from './oidc-jwks.service.js';

// Exact Central Login claim names are unconfirmed (docs/00-prd.md §11) —
// kept configurable rather than hardcoded so we don't silently guess wrong.
const ROLES_CLAIM = process.env.CENTRAL_LOGIN_ROLES_CLAIM ?? 'roles';
const ORG_CLAIM = process.env.CENTRAL_LOGIN_ORG_CLAIM ?? 'org_id';
const NAME_CLAIM = process.env.CENTRAL_LOGIN_NAME_CLAIM ?? 'name';

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class OidcAuthGuard implements CanActivate {
  constructor(
    private readonly jwks: OidcJwksService,
    private readonly users: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const issuer = process.env.CENTRAL_LOGIN_OIDC_ISSUER;
    if (!issuer) {
      throw new UnauthorizedException('Central Login OIDC issuer is not configured');
    }

    try {
      const jwks = await this.jwks.getJwks(issuer);
      const { payload } = await jwtVerify(token, jwks, { issuer });

      const orgClaim = payload[ORG_CLAIM];
      const nameClaim = payload[NAME_CLAIM];
      const centralLoginId = payload.sub ?? '';
      const email = typeof payload.email === 'string' ? payload.email : '';
      const orgId = typeof orgClaim === 'string' ? orgClaim : '';
      const displayName = typeof nameClaim === 'string' ? nameClaim : email;
      const roles = (Array.isArray(payload[ROLES_CLAIM]) ? payload[ROLES_CLAIM] : []) as Role[];

      // Mirrors this identity into the local User table so every FK in the
      // app (requester, approver, actor) can point at a real local id
      // instead of the opaque Central Login subject string.
      const localUser = await this.users.syncFromAuth(orgId, {
        centralLoginId,
        email,
        displayName,
        roles,
      });

      request.user = {
        localUserId: localUser.id,
        centralLoginId,
        email,
        displayName,
        orgId,
        roles,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length);
  }
}
