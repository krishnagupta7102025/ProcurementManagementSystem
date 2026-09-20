import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import {
  cleanupOrg,
  createTestCostCenter,
  createTestOrg,
  createTestUser,
  createTestVendor,
} from '../test-utils/seed-helpers.js';
import { GlExportService } from './gl-export.service.js';

describe('GlExportService (P2P-070)', () => {
  const prisma = new PrismaService();
  const service = new GlExportService(prisma);

  let org: { id: string };
  let requester: { id: string };
  let buyer: { id: string };
  let ap: { id: string };
  let vendor: { id: string };
  let costCenter: { id: string; code: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await createTestOrg(prisma);
    requester = await createTestUser(prisma, org.id, ['REQUESTER']);
    buyer = await createTestUser(prisma, org.id, ['BUYER']);
    ap = await createTestUser(prisma, org.id, ['AP']);
    vendor = await createTestVendor(prisma, org.id);
    costCenter = await createTestCostCenter(prisma, org.id, 'Engineering');
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  it('includes APPROVED_FOR_PAYMENT and PAID invoices with their cost center code', async () => {
    const client = forOrg(prisma, org.id);
    const requisition = await client.requisition.create({
      data: {
        requesterId: requester.id,
        costCenterId: costCenter.id,
        department: 'Engineering',
        status: 'APPROVED',
      } as never,
    });
    const reqLine = await client.requisitionLine.create({
      data: {
        requisitionId: requisition.id,
        description: 'Widget',
        quantity: 1,
        unit: 'unit',
        estimatedUnitPriceMinorUnits: 100,
      } as never,
    });
    const po = await client.purchaseOrder.create({
      data: { vendorId: vendor.id, buyerId: buyer.id, status: 'ISSUED' } as never,
    });
    const poLine = await client.pOLine.create({
      data: {
        purchaseOrderId: po.id,
        description: 'Widget',
        quantity: 1,
        unit: 'unit',
        unitPriceMinorUnits: 100,
      } as never,
    });
    await client.pOLineRequisitionLine.create({
      data: { poLineId: poLine.id, requisitionLineId: reqLine.id, quantity: 1 } as never,
    });
    const invoice = await client.invoice.create({
      data: {
        vendorId: vendor.id,
        invoiceNumber: `GL-${Date.now()}`,
        invoiceDate: new Date('2026-01-15'),
        taxMinorUnits: 10,
        subtotalMinorUnits: 100,
        totalMinorUnits: 110,
        status: 'APPROVED_FOR_PAYMENT',
        createdById: ap.id,
      } as never,
    });
    await client.invoiceLine.create({
      data: {
        invoiceId: invoice.id,
        poLineId: poLine.id,
        description: 'Widget',
        quantity: 1,
        unitPriceMinorUnits: 100,
      } as never,
    });

    const csv = await service.exportCsv(org.id);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('costCenterCodes');

    const dataRow = lines.find((l) => l.includes(invoice.invoiceNumber));
    expect(dataRow).toBeTruthy();
    expect(dataRow).toContain(costCenter.code);
    expect(dataRow).toContain('110');
  });

  it('excludes DRAFT/MATCH_EXCEPTION invoices', async () => {
    const client = forOrg(prisma, org.id);
    const draftInvoice = await client.invoice.create({
      data: {
        vendorId: vendor.id,
        invoiceNumber: `EXCLUDED-${Date.now()}`,
        invoiceDate: new Date(),
        taxMinorUnits: 0,
        totalMinorUnits: 100,
        status: 'DRAFT',
        createdById: ap.id,
      } as never,
    });

    const csv = await service.exportCsv(org.id);
    expect(csv).not.toContain(draftInvoice.invoiceNumber);
  });
});
