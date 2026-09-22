import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './auth.types.js';
import { verifySessionToken } from './jwt.util.js';

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

/** Verifies the Bearer token issued by AuthService.login() and attaches the decoded claims to the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const claims = await verifySessionToken(token);
      request.user = {
        localUserId: claims.sub,
        orgId: claims.orgId,
        email: claims.email,
        displayName: claims.displayName,
        roles: claims.roles,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired session — please log in again');
    }

    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length);
  }
}
