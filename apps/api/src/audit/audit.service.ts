import { Injectable } from '@nestjs/common';
import type { ScopedPrismaClient } from '../prisma/scoped-prisma.js';

export interface RecordAuditParams {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Wire this into every mutating service method (P2P-004). Takes the
 * caller's already org-scoped Prisma client so the audit row lands in the
 * same tenant automatically — callers never pass orgId directly.
 */
@Injectable()
export class AuditService {
  async record(client: ScopedPrismaClient, params: RecordAuditParams): Promise<void> {
    // orgId is injected by the scoped-client extension at call time, so it
    // isn't part of this object — cast past Prisma's generated input type
    // rather than fabricate a placeholder orgId here.
    await client.auditLogEntry.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        actorId: params.actorId,
        before: params.before ?? undefined,
        after: params.after ?? undefined,
      } as never,
    });
  }
}
