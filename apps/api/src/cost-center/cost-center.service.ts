import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import type { CreateCostCenterDto } from './dto/create-cost-center.dto.js';

/**
 * Was never given its own ticket in Epic A (P2P-002 only covered the
 * schema) — added while building the requisition UI, which has nothing to
 * populate a cost-center picker from without this.
 */
@Injectable()
export class CostCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(orgId: string, actorId: string, dto: CreateCostCenterDto) {
    const client = forOrg(this.prisma, orgId);
    const costCenter = await client.costCenter.create({ data: dto as never });

    await this.audit.record(client, {
      entityType: 'CostCenter',
      entityId: costCenter.id,
      action: 'create',
      actorId,
      after: costCenter,
    });

    return costCenter;
  }

  async findAll(orgId: string, opts: { activeOnly?: boolean } = {}) {
    const client = forOrg(this.prisma, orgId);
    return client.costCenter.findMany({
      where: opts.activeOnly ? { isActive: true } : undefined,
      orderBy: { code: 'asc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const costCenter = await client.costCenter.findUnique({ where: { id } });
    if (!costCenter) {
      throw new NotFoundException(`Cost center ${id} not found`);
    }
    return costCenter;
  }
}
