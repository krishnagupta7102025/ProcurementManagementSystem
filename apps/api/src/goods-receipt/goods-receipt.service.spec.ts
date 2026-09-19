import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import {
  cleanupOrg,
  createTestOrg,
  createTestUser,
  createTestVendor,
} from '../test-utils/seed-helpers.js';
import { GoodsReceiptService } from './goods-receipt.service.js';

describe('GoodsReceiptService (P2P-040..042)', () => {
  const prisma = new PrismaService();
  const service = new GoodsReceiptService(prisma, new AuditService());

  let org: { id: string };
  let buyer: { id: string };
  let receiver: { id: string };
  let approver: { id: string };
  let vendor: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await createTestOrg(prisma);
    buyer = await createTestUser(prisma, org.id, ['BUYER']);
    receiver = await createTestUser(prisma, org.id, ['RECEIVER']);
    approver = await createTestUser(prisma, org.id, ['APPROVER']);
    vendor = await createTestVendor(prisma, org.id);
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  async function createIssuedPo(opts: { physicalQty?: number; withServiceLine?: boolean } = {}) {
    const client = forOrg(prisma, org.id);
    const po = await client.purchaseOrder.create({
      data: { vendorId: vendor.id, buyerId: buyer.id, status: 'ISSUED' } as never,
    });
    const physicalLine = await client.pOLine.create({
      data: {
        purchaseOrderId: po.id,
        description: 'Widget',
        quantity: opts.physicalQty ?? 10,
        unit: 'unit',
        unitPriceMinorUnits: 100,
      } as never,
    });
    let serviceLine: { id: string } | undefined;
    if (opts.withServiceLine) {
      serviceLine = await client.pOLine.create({
        data: {
          purchaseOrderId: po.id,
          description: 'Installation',
          quantity: 1,
          unit: 'job',
          unitPriceMinorUnits: 5000,
          isService: true,
        } as never,
      });
    }
    return { po, physicalLine, serviceLine };
  }

  it('records a partial receipt and moves the PO to PARTIALLY_RECEIVED (P2P-040, P2P-042)', async () => {
    const { po, physicalLine } = await createIssuedPo({ physicalQty: 10 });

    const receipt = await service.recordGrn(org.id, receiver.id, ['RECEIVER'], po.id, {
      lines: [{ poLineId: physicalLine.id, quantityReceived: 4 }],
    });
    expect(receipt.lines[0].quantityReceived).toBe(4);

    const client = forOrg(prisma, org.id);
    const updatedPo = await client.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(updatedPo?.status).toBe('PARTIALLY_RECEIVED');
  });

  it('moves the PO to FULLY_RECEIVED once every line (physical + service) is complete (P2P-041, P2P-042)', async () => {
    const { po, physicalLine, serviceLine } = await createIssuedPo({
      physicalQty: 5,
      withServiceLine: true,
    });

    await service.recordGrn(org.id, receiver.id, ['RECEIVER'], po.id, {
      lines: [{ poLineId: physicalLine.id, quantityReceived: 5 }],
    });

    let client = forOrg(prisma, org.id);
    let updatedPo = await client.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(updatedPo?.status).toBe('PARTIALLY_RECEIVED'); // service line still open

    await service.confirmService(org.id, approver.id, po.id, serviceLine!.id, 'looks good');

    client = forOrg(prisma, org.id);
    updatedPo = await client.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(updatedPo?.status).toBe('FULLY_RECEIVED');
  });

  it('blocks over-receipt without an override, and requires a Buyer role to override (P2P-040 AC)', async () => {
    const { po, physicalLine } = await createIssuedPo({ physicalQty: 5 });

    await expect(
      service.recordGrn(org.id, receiver.id, ['RECEIVER'], po.id, {
        lines: [{ poLineId: physicalLine.id, quantityReceived: 6 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Reason given, but the actor isn't a Buyer/Admin — still rejected.
    await expect(
      service.recordGrn(org.id, receiver.id, ['RECEIVER'], po.id, {
        lines: [{ poLineId: physicalLine.id, quantityReceived: 6 }],
        overrideReason: 'vendor shipped extra',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // A Buyer with a reason succeeds.
    const receipt = await service.recordGrn(org.id, buyer.id, ['BUYER'], po.id, {
      lines: [{ poLineId: physicalLine.id, quantityReceived: 6 }],
      overrideReason: 'vendor shipped extra',
    });
    expect(receipt.lines[0].overrideReason).toBe('vendor shipped extra');
  });

  it('rejects a physical GRN against a service line, and a service confirmation against a physical line', async () => {
    const { po, physicalLine, serviceLine } = await createIssuedPo({ withServiceLine: true });

    await expect(
      service.recordGrn(org.id, receiver.id, ['RECEIVER'], po.id, {
        lines: [{ poLineId: serviceLine!.id, quantityReceived: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.confirmService(org.id, approver.id, po.id, physicalLine.id, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects confirming the same service line twice', async () => {
    const { po, serviceLine } = await createIssuedPo({ withServiceLine: true });
    await service.confirmService(org.id, approver.id, po.id, serviceLine!.id, undefined);

    await expect(
      service.confirmService(org.id, approver.id, po.id, serviceLine!.id, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects receiving against a PO that is not ISSUED/PARTIALLY_RECEIVED', async () => {
    const client = forOrg(prisma, org.id);
    const draftPo = await client.purchaseOrder.create({
      data: { vendorId: vendor.id, buyerId: buyer.id, status: 'DRAFT' } as never,
    });
    const line = await client.pOLine.create({
      data: {
        purchaseOrderId: draftPo.id,
        description: 'Widget',
        quantity: 1,
        unit: 'unit',
        unitPriceMinorUnits: 100,
      } as never,
    });

    await expect(
      service.recordGrn(org.id, receiver.id, ['RECEIVER'], draftPo.id, {
        lines: [{ poLineId: line.id, quantityReceived: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
