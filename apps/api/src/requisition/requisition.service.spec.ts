import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApprovalRuleService } from '../approval/approval-rule.service.js';
import { ApprovalService } from '../approval/approval.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  cleanupOrg,
  createTestCostCenter,
  createTestOrg,
  createTestUser,
  fakeStorage,
} from '../test-utils/seed-helpers.js';
import { RequisitionService } from './requisition.service.js';

describe('RequisitionService (P2P-020)', () => {
  const prisma = new PrismaService();
  const audit = new AuditService();
  const rules = new ApprovalRuleService(prisma, audit);
  const approvals = new ApprovalService(prisma, audit, rules);
  const service = new RequisitionService(prisma, audit, approvals, fakeStorage());

  let org: { id: string };
  let requester: { id: string };
  let approver: { id: string };
  let costCenter: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await createTestOrg(prisma);
    requester = await createTestUser(prisma, org.id, ['REQUESTER']);
    approver = await createTestUser(prisma, org.id, ['APPROVER']);
    costCenter = await createTestCostCenter(prisma, org.id, 'Engineering');

    await rules.create(org.id, approver.id, {
      name: 'Default rule',
      steps: [{ stepOrder: 1, approverUserId: approver.id }],
    });
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  it('creates a draft and computes the estimated total from lines', async () => {
    const req = await service.create(org.id, requester.id, {
      costCenterId: costCenter.id,
      department: 'Engineering',
      lines: [
        { description: 'Laptop', quantity: 2, unit: 'unit', estimatedUnitPriceMinorUnits: 150000 },
        { description: 'Monitor', quantity: 2, unit: 'unit', estimatedUnitPriceMinorUnits: 30000 },
      ],
    });

    expect(req.status).toBe('DRAFT');
    expect(req.estimatedTotalMinorUnits).toBe(2 * 150000 + 2 * 30000);
    expect(req.lines).toHaveLength(2);
  });

  it('lets a draft be edited freely', async () => {
    const req = await service.create(org.id, requester.id, {
      costCenterId: costCenter.id,
      department: 'Engineering',
      lines: [
        { description: 'Chair', quantity: 1, unit: 'unit', estimatedUnitPriceMinorUnits: 5000 },
      ],
    });

    const updated = await service.update(org.id, requester.id, req.id, {
      justification: 'ergonomic upgrade',
      lines: [
        { description: 'Chair', quantity: 2, unit: 'unit', estimatedUnitPriceMinorUnits: 5000 },
      ],
    });

    expect(updated.justification).toBe('ergonomic upgrade');
    expect(updated.estimatedTotalMinorUnits).toBe(10000);
  });

  it('rejects submitting a requisition with zero line items (P2P-020 AC)', async () => {
    const req = await service.create(org.id, requester.id, {
      costCenterId: costCenter.id,
      department: 'Engineering',
      lines: [],
    });

    await expect(service.submit(org.id, requester.id, req.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('submitting resolves an approval chain, and a submitted requisition can no longer be edited (P2P-020 AC)', async () => {
    const req = await service.create(org.id, requester.id, {
      costCenterId: costCenter.id,
      department: 'Engineering',
      lines: [
        { description: 'Desk', quantity: 1, unit: 'unit', estimatedUnitPriceMinorUnits: 20000 },
      ],
    });

    const submitted = await service.submit(org.id, requester.id, req.id);
    expect(submitted.status).toBe('SUBMITTED');
    expect(submitted.approvalSteps).toHaveLength(1);
    expect(submitted.approvalSteps[0].approverUserId).toBe(approver.id);

    await expect(
      service.update(org.id, requester.id, req.id, { justification: 'too late' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('withdraw sends a submitted requisition back to an editable-adjacent terminal state', async () => {
    const req = await service.create(org.id, requester.id, {
      costCenterId: costCenter.id,
      department: 'Engineering',
      lines: [
        { description: 'Keyboard', quantity: 1, unit: 'unit', estimatedUnitPriceMinorUnits: 8000 },
      ],
    });
    const submitted = await service.submit(org.id, requester.id, req.id);

    const withdrawn = await service.withdraw(org.id, requester.id, submitted.id);
    expect(withdrawn.status).toBe('WITHDRAWN');
  });

  it('clone copies line items into a new draft', async () => {
    const req = await service.create(org.id, requester.id, {
      costCenterId: costCenter.id,
      department: 'Engineering',
      lines: [
        { description: 'Mouse', quantity: 3, unit: 'unit', estimatedUnitPriceMinorUnits: 1500 },
      ],
    });

    const cloned = await service.clone(org.id, requester.id, req.id);
    expect(cloned.id).not.toBe(req.id);
    expect(cloned.status).toBe('DRAFT');
    expect(cloned.lines).toHaveLength(1);
    expect(cloned.lines[0].description).toBe('Mouse');
  });

  it('adds a supporting-document attachment and returns a download URL for it', async () => {
    const req = await service.create(org.id, requester.id, {
      costCenterId: costCenter.id,
      department: 'Engineering',
      lines: [{ description: 'Laptop', quantity: 1, unit: 'unit', estimatedUnitPriceMinorUnits: 150000 }],
    });

    const attachment = await service.addAttachment(org.id, requester.id, req.id, {
      fileName: 'quote.pdf',
      contentType: 'application/pdf',
      base64Content: Buffer.from('fake pdf bytes').toString('base64'),
    });
    expect(attachment.fileName).toBe('quote.pdf');

    const { downloadUrl } = await service.getAttachmentDownloadUrl(org.id, req.id, attachment.id);
    expect(downloadUrl).toContain(org.id);

    const reloaded = await service.findOne(org.id, req.id);
    expect(reloaded.attachments).toHaveLength(1);
  });
});
