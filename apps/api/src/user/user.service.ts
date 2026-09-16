import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import type { Role } from '../generated/prisma/enums.js';

export interface AuthClaims {
  centralLoginId: string;
  email: string;
  displayName: string;
  roles: Role[];
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upserts the local User mirror row for an authenticated Central Login
   * identity, returning its local id — every FK in this app (requester,
   * approver, actor) points at this id, never at centralLoginId directly.
   * Called once per request from OidcAuthGuard.
   */
  async syncFromAuth(orgId: string, claims: AuthClaims) {
    // Uses the raw client rather than an org-scoped one: this is the one
    // place that establishes the org<->user link itself, prior to there
    // being a "current user" to scope by.
    return this.prisma.user.upsert({
      where: { centralLoginId: claims.centralLoginId },
      update: { email: claims.email, displayName: claims.displayName, roles: claims.roles, orgId },
      create: {
        orgId,
        centralLoginId: claims.centralLoginId,
        email: claims.email,
        displayName: claims.displayName,
        roles: claims.roles,
      },
    });
  }

  async findAll(orgId: string) {
    const client = forOrg(this.prisma, orgId);
    return client.user.findMany({ orderBy: { displayName: 'asc' } });
  }
}
