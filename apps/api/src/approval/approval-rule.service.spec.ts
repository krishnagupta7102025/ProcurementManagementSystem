import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  cleanupOrg,
  createTestCostCenter,
  createTestOrg,
  createTestUser,
} from '../test-utils/seed-helpers.js';
import { ApprovalRuleService } from './approval-rule.service.js';

describe('ApprovalRuleService (P2P-021)', () => {
  const prisma = new PrismaService();
  const service = new ApprovalRuleService(prisma, new AuditService());

  let org: { id: string };
  let deptHead: { id: string };
  let financeController: { id: string };
  let costCenter: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await createTestOrg(prisma);
    deptHead = await createTestUser(prisma, org.id, ['APPROVER']);
    financeController = await createTestUser(prisma, org.id, ['CONTROLLER']);
    costCenter = await createTestCostCenter(prisma, org.id, 'Marketing');

    // Wildcard, low-amount rule: any department, up to 50000 -> dept head only.
    await service.create(org.id, deptHead.id, {
      name: 'Low value, any dept',
      minAmountMinorUnits: 0,
      maxAmountMinorUnits: 5_000_000,
      steps: [{ stepOrder: 1, approverUserId: deptHead.id }],
    });

    // More specific: this exact cost center, any amount -> dept head then controller.
    await service.create(org.id, deptHead.id, {
      name: 'Marketing cost center, two-step',
      costCenterId: costCenter.id,
      minAmountMinorUnits: 0,
      steps: [
        { stepOrder: 1, approverUserId: deptHead.id },
        { stepOrder: 2, approverUserId: financeController.id },
      ],
    });
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  it('prefers the rule with the more specific cost center match', async () => {
    const resolved = await service.resolveRule(org.id, {
      department: 'Marketing',
      costCenterId: costCenter.id,
      amountMinorUnits: 10_000,
    });

    expect(resolved?.name).toBe('Marketing cost center, two-step');
    expect(resolved?.steps).toHaveLength(2);
  });

  it('falls back to the wildcard rule for a different cost center', async () => {
    const otherCostCenter = await createTestCostCenter(prisma, org.id, 'Sales');
    const resolved = await service.resolveRule(org.id, {
      department: 'Sales',
      costCenterId: otherCostCenter.id,
      amountMinorUnits: 10_000,
    });

    expect(resolved?.name).toBe('Low value, any dept');
  });

  it('returns null when amount exceeds every matching rule’s max', async () => {
    const resolved = await service.resolveRule(org.id, {
      department: 'Sales',
      costCenterId: 'no-such-cost-center',
      amountMinorUnits: 999_999_999,
    });

    expect(resolved).toBeNull();
  });
});
