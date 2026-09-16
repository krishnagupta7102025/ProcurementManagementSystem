import type { PrismaService } from './prisma.service.js';

/**
 * Models that carry an orgId column and must never be queried without it.
 * Org itself is excluded — it IS the tenant boundary, not scoped by one.
 */
const ORG_SCOPED_MODELS = new Set(['User', 'CostCenter', 'AuditLogEntry']);

const SINGLE_CREATE_OPS = new Set(['create']);
const MANY_CREATE_OPS = new Set(['createMany', 'createManyAndReturn']);
const WHERE_MERGE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Returns a Prisma client bound to a single org. Every operation against an
 * org-scoped model has orgId forced into its `where` (reads/updates/deletes)
 * or `data` (creates) — the caller's own value, if any, is always
 * overridden by the real orgId, so a bug elsewhere can never leak or write
 * across tenants (P2P-002 AC).
 *
 * This is the ONLY way feature services should touch the database — never
 * inject PrismaService directly into a service that handles tenant data.
 */
export function forOrg(prisma: PrismaService, orgId: string) {
  return prisma.$extends({
    name: 'org-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!ORG_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const scopedArgs = args as Record<string, unknown>;

          if (SINGLE_CREATE_OPS.has(operation)) {
            scopedArgs.data = { ...(scopedArgs.data as object), orgId };
          } else if (MANY_CREATE_OPS.has(operation)) {
            const data = scopedArgs.data as object[];
            scopedArgs.data = data.map((row) => ({ ...row, orgId }));
          } else if (operation === 'upsert') {
            scopedArgs.where = { ...(scopedArgs.where as object), orgId };
            scopedArgs.create = { ...(scopedArgs.create as object), orgId };
          } else if (WHERE_MERGE_OPS.has(operation)) {
            scopedArgs.where = { ...(scopedArgs.where as object), orgId };
          }

          return query(scopedArgs as never);
        },
      },
    },
  });
}

export type ScopedPrismaClient = ReturnType<typeof forOrg>;
