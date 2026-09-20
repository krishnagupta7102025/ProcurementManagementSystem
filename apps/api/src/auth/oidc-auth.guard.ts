import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { jwtVerify } from 'jose';
import type { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserService } from '../user/user.service.js';
import type { AuthenticatedUser } from './auth.types.js';
import { OidcJwksService } from './oidc-jwks.service.js';
import { isDevAuthBypassEnabled } from './dev-auth-bypass.js';

// Exact Central Login claim names are unconfirmed (docs/00-prd.md §11) —
// kept configurable rather than hardcoded so we don't silently guess wrong.
const ROLES_CLAIM = process.env.CENTRAL_LOGIN_ROLES_CLAIM ?? 'roles';
const ORG_CLAIM = process.env.CENTRAL_LOGIN_ORG_CLAIM ?? 'org_id';
const NAME_CLAIM = process.env.CENTRAL_LOGIN_NAME_CLAIM ?? 'name';

const DEV_BYPASS_HEADER = 'x-dev-user-email';
const DEV_BYPASS_DEFAULT_EMAIL = 'admin@demo.p2p';

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class OidcAuthGuard implements CanActivate {
  private readonly logger = new Logger(OidcAuthGuard.name);

  constructor(
    private readonly jwks: OidcJwksService,
    private readonly users: UserService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (isDevAuthBypassEnabled()) {
      return this.handleDevBypass(request);
    }

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

  /**
   * Local-testing-only path (see dev-auth-bypass.ts for the safety gate).
   * No JWT at all — picks an existing local User by email (defaulting to
   * the seeded demo admin) via the `x-dev-user-email` header, so curl/
   * Postman/browser testing works against real endpoints without a real
   * Central Login session. Every use is logged loudly on purpose.
   */
  private async handleDevBypass(request: AuthenticatedRequest): Promise<boolean> {
    const email = (request.headers[DEV_BYPASS_HEADER] as string | undefined) ?? DEV_BYPASS_DEFAULT_EMAIL;
    this.logger.warn(`DEV_AUTH_BYPASS active — authenticating as "${email}" with no real credential check`);

    const user = await this.prisma.user.findFirst({ where: { email } });
    if (!user) {
      throw new UnauthorizedException(
        `DEV_AUTH_BYPASS: no user found with email "${email}" — run the seed script, or pass a different ${DEV_BYPASS_HEADER} header`,
      );
    }

    request.user = {
      localUserId: user.id,
      centralLoginId: user.centralLoginId,
      email: user.email,
      displayName: user.displayName,
      orgId: user.orgId,
      roles: user.roles,
    };
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length);
  }
}
