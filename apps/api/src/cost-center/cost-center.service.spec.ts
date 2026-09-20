import { NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { cleanupOrg, createTestOrg, createTestUser } from '../test-utils/seed-helpers.js';
import { CostCenterService } from './cost-center.service.js';

describe('CostCenterService', () => {
  const prisma = new PrismaService();
  const service = new CostCenterService(prisma, new AuditService());

  let org: { id: string };
  let admin: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await createTestOrg(prisma);
    admin = await createTestUser(prisma, org.id, ['ADMIN']);
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  it('creates and lists cost centers scoped to the org', async () => {
    const costCenter = await service.create(org.id, admin.id, {
      code: 'ENG-100',
      name: 'Engineering',
      department: 'Engineering',
    });
    expect(costCenter.code).toBe('ENG-100');

    const all = await service.findAll(org.id);
    expect(all.map((c) => c.id)).toContain(costCenter.id);
  });

  it('findOne throws for a cost center that does not exist', async () => {
    await expect(service.findOne(org.id, 'does-not-exist')).rejects.toBeInstanceOf(NotFoundException);
  });
});
