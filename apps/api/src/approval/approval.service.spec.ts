import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import {
  cleanupOrg,
  createTestCostCenter,
  createTestOrg,
  createTestUser,
} from '../test-utils/seed-helpers.js';
import { ApprovalRuleService } from './approval-rule.service.js';
import { ApprovalService } from './approval.service.js';

describe('ApprovalService (P2P-022)', () => {
  const prisma = new PrismaService();
  const audit = new AuditService();
  const rules = new ApprovalRuleService(prisma, audit);
  const service = new ApprovalService(prisma, audit, rules);

  let org: { id: string };
  let requester: { id: string };
  let stepOneApprover: { id: string };
  let stepTwoApprover: { id: string };
  let outsider: { id: string };
  let costCenter: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await createTestOrg(prisma);
    requester = await createTestUser(prisma, org.id, ['REQUESTER']);
    stepOneApprover = await createTestUser(prisma, org.id, ['APPROVER']);
    stepTwoApprover = await createTestUser(prisma, org.id, ['CONTROLLER']);
    outsider = await createTestUser(prisma, org.id, ['APPROVER']);
    costCenter = await createTestCostCenter(prisma, org.id, 'Finance');

    await rules.create(org.id, requester.id, {
      name: 'Two-step',
      steps: [
        { stepOrder: 1, approverUserId: stepOneApprover.id },
        { stepOrder: 2, approverUserId: stepTwoApprover.id },
      ],
    });
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  async function createSubmittedRequisition() {
    const client = forOrg(prisma, org.id);
    const req = await client.requisition.create({
      data: {
        requesterId: requester.id,
        costCenterId: costCenter.id,
        department: 'Finance',
        estimatedTotalMinorUnits: 10_000,
        status: 'SUBMITTED',
      } as never,
    });
    await service.createChainForRequisition(org.id, {
      id: req.id,
      department: 'Finance',
      costCenterId: costCenter.id,
      estimatedTotalMinorUnits: 10_000,
    });
    return req;
  }

  it('rejects an approver acting on a step that is not yet active (out of turn, P2P-022 AC)', async () => {
    const req = await createSubmittedRequisition();

    // stepTwoApprover tries to act before stepOneApprover has approved.
    await expect(
      service.act(org.id, stepTwoApprover.id, req.id, 'approve', undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a user who is not the active step’s approver at all (P2P-022 AC)', async () => {
    const req = await createSubmittedRequisition();

    await expect(
      service.act(org.id, outsider.id, req.id, 'approve', undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires a reason to reject or request changes', async () => {
    const req = await createSubmittedRequisition();

    await expect(
      service.act(org.id, stepOneApprover.id, req.id, 'reject', undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('walks a requisition through both steps to full approval', async () => {
    const req = await createSubmittedRequisition();

    await service.act(org.id, stepOneApprover.id, req.id, 'approve', undefined);

    // Now step two should be active, and step one's approver is done.
    await expect(
      service.act(org.id, stepOneApprover.id, req.id, 'approve', undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await service.act(org.id, stepTwoApprover.id, req.id, 'approve', undefined);

    const client = forOrg(prisma, org.id);
    const final = await client.requisition.findUnique({ where: { id: req.id } });
    expect(final?.status).toBe('APPROVED');
  });

  it('a rejection at any step marks the requisition REJECTED', async () => {
    const req = await createSubmittedRequisition();
    await service.act(org.id, stepOneApprover.id, req.id, 'reject', 'budget exceeded');

    const client = forOrg(prisma, org.id);
    const final = await client.requisition.findUnique({ where: { id: req.id } });
    expect(final?.status).toBe('REJECTED');
  });

  it('a request for changes marks the requisition CHANGES_REQUESTED', async () => {
    const req = await createSubmittedRequisition();
    await service.act(org.id, stepOneApprover.id, req.id, 'request_changes', 'wrong cost center');

    const client = forOrg(prisma, org.id);
    const final = await client.requisition.findUnique({ where: { id: req.id } });
    expect(final?.status).toBe('CHANGES_REQUESTED');
  });

  it('lists a pending step under the active approver’s "my pending approvals"', async () => {
    const req = await createSubmittedRequisition();

    const pending = await service.findMyPending(org.id, stepOneApprover.id);
    expect(pending.map((s) => s.requisitionId)).toContain(req.id);

    const stepTwoPending = await service.findMyPending(org.id, stepTwoApprover.id);
    expect(stepTwoPending.map((s) => s.requisitionId)).not.toContain(req.id);
  });
});
