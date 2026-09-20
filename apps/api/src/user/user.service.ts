import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import type { Role } from '../generated/prisma/enums.js';
import type { CreateUserDto } from './dto/create-user.dto.js';

export interface AuthClaims {
  centralLoginId: string;
  email: string;
  displayName: string;
  roles: Role[];
}

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

  /**
   * Admin-provisions a user ahead of their first real Central Login
   * sign-in (P2P wave 2 addition — Phase 0 has no user-management UI yet).
   * centralLoginId is synthesized here since the real OIDC subject isn't
   * known until they actually sign in; syncFromAuth() reconciles by
   * centralLoginId today, so a user provisioned this way will show up as a
   * *second* row once Central Login is wired up for real, keyed by their
   * real subject — a known Phase 0 gap, not something to silently paper
   * over with an email-based upsert here.
   */
  async create(orgId: string, actorId: string, dto: CreateUserDto) {
    const client = forOrg(this.prisma, orgId);
    const existing = await client.user.findFirst({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException(`A user with email "${dto.email}" already exists in this org`);
    }

    const user = await client.user.create({
      data: {
        centralLoginId: `pending:${randomUUID()}`,
        email: dto.email,
        displayName: dto.displayName,
        roles: dto.roles,
        managerId: dto.managerId,
      } as never,
    });

    await this.audit.record(client, {
      entityType: 'User',
      entityId: user.id,
      action: 'create',
      actorId,
      after: user,
    });

    return user;
  }
}
