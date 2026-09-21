import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import type { EmailMessage, EmailService } from '../email/email.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import type { StorageService } from '../storage/storage.service.js';
import {
  cleanupOrg,
  createTestCostCenter,
  createTestOrg,
  createTestUser,
  createTestVendor,
} from '../test-utils/seed-helpers.js';
import { PurchaseOrderService } from './purchase-order.service.js';

class RecordingEmailService implements EmailService {
  sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

// A test double for StorageService — real S3 credentials aren't configured
// in this environment, and the point of these tests is PurchaseOrderService
// logic, not S3 itself (which has its own tests in storage.service.spec.ts).
function fakeStorage() {
  const uploaded = new Map<string, Uint8Array>();
  return {
    buildKey: (orgId: string, path: string) => `${orgId}/${path}`,
    putObject: async (_orgId: string, key: string, body: Uint8Array) => {
      uploaded.set(key, body);
    },
    getDownloadUrl: async (orgId: string, key: string) => `https://fake-storage.test/${orgId}/${key}`,
    uploaded,
  } as unknown as StorageService & { uploaded: Map<string, Uint8Array> };
}

describe('PurchaseOrderService (P2P-030..032)', () => {
  const prisma = new PrismaService();
  const audit = new AuditService();

  let org: { id: string };
  let buyer: { id: string };
  let controller: { id: string };
  let requester: { id: string };
  let costCenter: { id: string };
  let vendor: { id: string };
  let onHoldVendor: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await createTestOrg(prisma);
    buyer = await createTestUser(prisma, org.id, ['BUYER']);
    controller = await createTestUser(prisma, org.id, ['CONTROLLER']);
    requester = await createTestUser(prisma, org.id, ['REQUESTER']);
    costCenter = await createTestCostCenter(prisma, org.id, 'Ops');
    vendor = await createTestVendor(prisma, org.id, 'vendor@example.test');
    onHoldVendor = await createTestVendor(prisma, org.id);
    await prisma.vendor.update({ where: { id: onHoldVendor.id }, data: { status: 'ON_HOLD' } });
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  async function createApprovedRequisitionLine(quantity: number, unitPriceMinorUnits: number) {
    const client = forOrg(prisma, org.id);
    const requisition = await client.requisition.create({
      data: {
        requesterId: requester.id,
        costCenterId: costCenter.id,
        department: 'Ops',
        status: 'APPROVED',
        estimatedTotalMinorUnits: quantity * unitPriceMinorUnits,
      } as never,
    });
    const line = await client.requisitionLine.create({
      data: {
        requisitionId: requisition.id,
        description: 'Widget',
        quantity,
        unit: 'unit',
        estimatedUnitPriceMinorUnits: unitPriceMinorUnits,
      } as never,
    });
    return { requisition, line };
  }

  function service() {
    return new PurchaseOrderService(prisma, audit, fakeStorage(), new RecordingEmailService());
  }

  it('creates a DRAFT PO tracing back to a requisition line and computes the total', async () => {
    const { line } = await createApprovedRequisitionLine(10, 500);
    const po = await service().create(org.id, buyer.id, {
      vendorId: vendor.id,
      lines: [
        {
          description: 'Widget',
          quantity: 10,
          unit: 'unit',
          unitPriceMinorUnits: 500,
          allocations: [{ requisitionLineId: line.id, quantity: 10 }],
        },
      ],
    });

    expect(po.status).toBe('DRAFT');
    expect(po.negotiatedTotalMinorUnits).toBe(5000);
    expect(po.lines[0].requisitionAllocs[0].requisitionLineId).toBe(line.id);
  });

  it('defaults currency to the org base currency with an implicit rate of 1', async () => {
    const { line } = await createApprovedRequisitionLine(1, 100);
    const po = await service().create(org.id, buyer.id, {
      vendorId: vendor.id,
      lines: [
        {
          description: 'Widget',
          quantity: 1,
          unit: 'unit',
          unitPriceMinorUnits: 100,
          allocations: [{ requisitionLineId: line.id, quantity: 1 }],
        },
      ],
    });

    expect(po.currency).toBe('INR');
    expect(po.fxRateToBase).toBe(1);
    expect(po.baseCurrencyTotalMinorUnits).toBe(100);
  });

  it('converts a foreign-currency PO to the base currency using the given rate (P2P-080)', async () => {
    const { line } = await createApprovedRequisitionLine(1, 100);
    const po = await service().create(org.id, buyer.id, {
      vendorId: vendor.id,
      currency: 'USD',
      fxRateToBase: 83,
      lines: [
        {
          description: 'Widget',
          quantity: 1,
          unit: 'unit',
          unitPriceMinorUnits: 100,
          allocations: [{ requisitionLineId: line.id, quantity: 1 }],
        },
      ],
    });

    expect(po.currency).toBe('USD');
    expect(po.fxRateToBase).toBe(83);
    expect(po.baseCurrencyTotalMinorUnits).toBe(8300);
  });

  it('rejects a foreign-currency PO with no rate given', async () => {
    const { line } = await createApprovedRequisitionLine(1, 100);
    await expect(
      service().create(org.id, buyer.id, {
        vendorId: vendor.id,
        currency: 'USD',
        lines: [
          {
            description: 'Widget',
            quantity: 1,
            unit: 'unit',
            unitPriceMinorUnits: 100,
            allocations: [{ requisitionLineId: line.id, quantity: 1 }],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects creating a PO against a vendor that is not ACTIVE', async () => {
    const { line } = await createApprovedRequisitionLine(1, 100);
    await expect(
      service().create(org.id, buyer.id, {
        vendorId: onHoldVendor.id,
        lines: [
          {
            description: 'Widget',
            quantity: 1,
            unit: 'unit',
            unitPriceMinorUnits: 100,
            allocations: [{ requisitionLineId: line.id, quantity: 1 }],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects allocating against a requisition line whose requisition is not APPROVED', async () => {
    const client = forOrg(prisma, org.id);
    const requisition = await client.requisition.create({
      data: {
        requesterId: requester.id,
        costCenterId: costCenter.id,
        department: 'Ops',
        status: 'DRAFT',
      } as never,
    });
    const line = await client.requisitionLine.create({
      data: {
        requisitionId: requisition.id,
        description: 'Widget',
        quantity: 5,
        unit: 'unit',
        estimatedUnitPriceMinorUnits: 100,
      } as never,
    });

    await expect(
      service().create(org.id, buyer.id, {
        vendorId: vendor.id,
        lines: [
          {
            description: 'Widget',
            quantity: 5,
            unit: 'unit',
            unitPriceMinorUnits: 100,
            allocations: [{ requisitionLineId: line.id, quantity: 5 }],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects over-allocating a requisition line without the override flag, allows it with the override (P2P-030 AC)', async () => {
    const { line } = await createApprovedRequisitionLine(5, 100);

    await expect(
      service().create(org.id, buyer.id, {
        vendorId: vendor.id,
        lines: [
          {
            description: 'Widget',
            quantity: 10,
            unit: 'unit',
            unitPriceMinorUnits: 100,
            allocations: [{ requisitionLineId: line.id, quantity: 10 }],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const po = await service().create(org.id, buyer.id, {
      vendorId: vendor.id,
      overrideQuantityCheck: true,
      lines: [
        {
          description: 'Widget',
          quantity: 10,
          unit: 'unit',
          unitPriceMinorUnits: 100,
          allocations: [{ requisitionLineId: line.id, quantity: 10 }],
        },
      ],
    });
    expect(po.negotiatedTotalMinorUnits).toBe(1000);
  });

  it('issues a PO directly when the negotiated total is within tolerance of the requisition estimate', async () => {
    const { line } = await createApprovedRequisitionLine(10, 100); // estimate = 1000
    const svc = service();
    const po = await svc.create(org.id, buyer.id, {
      vendorId: vendor.id,
      lines: [
        {
          description: 'Widget',
          quantity: 10,
          unit: 'unit',
          unitPriceMinorUnits: 105, // 1050, within 10% of 1000
          allocations: [{ requisitionLineId: line.id, quantity: 10 }],
        },
      ],
    });

    const issued = await svc.issue(org.id, buyer.id, po.id);
    expect(issued.status).toBe('ISSUED');
  });

  it('routes a PO through PENDING_APPROVAL when it exceeds tolerance, and approveVariance issues it (P2P-031)', async () => {
    const { line } = await createApprovedRequisitionLine(10, 100); // estimate = 1000
    const svc = service();
    const po = await svc.create(org.id, buyer.id, {
      vendorId: vendor.id,
      lines: [
        {
          description: 'Widget',
          quantity: 10,
          unit: 'unit',
          unitPriceMinorUnits: 200, // 2000, way over 10% tolerance
          allocations: [{ requisitionLineId: line.id, quantity: 10 }],
        },
      ],
    });

    const afterIssueAttempt = await svc.issue(org.id, buyer.id, po.id);
    expect(afterIssueAttempt.status).toBe('PENDING_APPROVAL');

    const approved = await svc.approveVariance(org.id, controller.id, po.id);
    expect(approved.status).toBe('ISSUED');
  });

  it('guards PO status transitions — cannot cancel an already-cancelled PO', async () => {
    const { line } = await createApprovedRequisitionLine(1, 100);
    const svc = service();
    const po = await svc.create(org.id, buyer.id, {
      vendorId: vendor.id,
      lines: [
        {
          description: 'Widget',
          quantity: 1,
          unit: 'unit',
          unitPriceMinorUnits: 100,
          allocations: [{ requisitionLineId: line.id, quantity: 1 }],
        },
      ],
    });

    await svc.cancel(org.id, buyer.id, po.id, 'no longer needed');
    await expect(svc.cancel(org.id, buyer.id, po.id, 'again')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('generates a PDF and sends it to the vendor contact only once ISSUED (P2P-032)', async () => {
    const { line } = await createApprovedRequisitionLine(1, 100);
    const storage = fakeStorage();
    const emails = new RecordingEmailService();
    const svc = new PurchaseOrderService(prisma, audit, storage, emails);

    const po = await svc.create(org.id, buyer.id, {
      vendorId: vendor.id,
      lines: [
        {
          description: 'Widget',
          quantity: 1,
          unit: 'unit',
          unitPriceMinorUnits: 100,
          allocations: [{ requisitionLineId: line.id, quantity: 1 }],
        },
      ],
    });

    await expect(svc.sendToVendor(org.id, buyer.id, po.id, 'please fulfil')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await svc.issue(org.id, buyer.id, po.id);
    const sent = await svc.sendToVendor(org.id, buyer.id, po.id, 'please fulfil');

    expect(sent.sentToVendorAt).not.toBeNull();
    expect(emails.sent).toHaveLength(1);
    expect(emails.sent[0].to).toBe('vendor@example.test');
    expect(storage.uploaded.size).toBe(1);
  });

  it('generates a PDF on first request and reuses it on the next (P2P-032)', async () => {
    const { line } = await createApprovedRequisitionLine(1, 100);
    const storage = fakeStorage();
    const emails = new RecordingEmailService();
    const svc = new PurchaseOrderService(prisma, audit, storage, emails);

    const po = await svc.create(org.id, buyer.id, {
      vendorId: vendor.id,
      lines: [
        {
          description: 'Widget',
          quantity: 1,
          unit: 'unit',
          unitPriceMinorUnits: 100,
          allocations: [{ requisitionLineId: line.id, quantity: 1 }],
        },
      ],
    });

    const first = await svc.getPdfDownloadUrl(org.id, po.id);
    expect(first.downloadUrl).toContain(org.id);
    expect(storage.uploaded.size).toBe(1);

    const second = await svc.getPdfDownloadUrl(org.id, po.id);
    expect(second.downloadUrl).toBe(first.downloadUrl);
    expect(storage.uploaded.size).toBe(1);
  });
});
