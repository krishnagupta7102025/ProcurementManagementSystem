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
import { ReportingService } from './reporting.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('ReportingService (P2P-071)', () => {
  const prisma = new PrismaService();
  const service = new ReportingService(prisma);

  let org: { id: string };
  let requester: { id: string };
  let approver: { id: string };
  let buyer: { id: string };
  let ap: { id: string };
  let vendorA: { id: string };
  let vendorB: { id: string };
  let costCenter: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await createTestOrg(prisma);
    requester = await createTestUser(prisma, org.id, ['REQUESTER']);
    approver = await createTestUser(prisma, org.id, ['APPROVER']);
    buyer = await createTestUser(prisma, org.id, ['BUYER']);
    ap = await createTestUser(prisma, org.id, ['AP']);
    vendorA = await createTestVendor(prisma, org.id);
    vendorB = await createTestVendor(prisma, org.id);
    costCenter = await createTestCostCenter(prisma, org.id, 'Ops');
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  it('sums open PO commitment by vendor, excluding DRAFT/CANCELLED/CLOSED', async () => {
    const client = forOrg(prisma, org.id);
    await client.purchaseOrder.create({
      data: {
        vendorId: vendorA.id,
        buyerId: buyer.id,
        status: 'ISSUED',
        negotiatedTotalMinorUnits: 1000,
      } as never,
    });
    await client.purchaseOrder.create({
      data: {
        vendorId: vendorA.id,
        buyerId: buyer.id,
        status: 'PARTIALLY_RECEIVED',
        negotiatedTotalMinorUnits: 500,
      } as never,
    });
    await client.purchaseOrder.create({
      data: {
        vendorId: vendorB.id,
        buyerId: buyer.id,
        status: 'DRAFT',
        negotiatedTotalMinorUnits: 9999,
      } as never,
    });
    await client.purchaseOrder.create({
      data: {
        vendorId: vendorB.id,
        buyerId: buyer.id,
        status: 'CANCELLED',
        negotiatedTotalMinorUnits: 9999,
      } as never,
    });

    const result = await service.openPoCommitment(org.id);
    expect(result.totalMinorUnits).toBe(1500);
    const vendorAEntry = result.byVendor.find((v) => v.vendorId === vendorA.id);
    expect(vendorAEntry?.totalMinorUnits).toBe(1500);
  });

  it('buckets AP aging by days past due', async () => {
    const client = forOrg(prisma, org.id);
    const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

    await client.invoice.create({
      data: {
        vendorId: vendorA.id,
        invoiceNumber: `AGE-CURRENT-${Date.now()}`,
        invoiceDate: new Date(),
        dueDate: daysAgo(-10), // not yet due
        taxMinorUnits: 0,
        totalMinorUnits: 100,
        status: 'APPROVED_FOR_PAYMENT',
        createdById: ap.id,
      } as never,
    });
    await client.invoice.create({
      data: {
        vendorId: vendorA.id,
        invoiceNumber: `AGE-45-${Date.now()}`,
        invoiceDate: new Date(),
        dueDate: daysAgo(45),
        taxMinorUnits: 0,
        totalMinorUnits: 200,
        status: 'APPROVED_FOR_PAYMENT',
        createdById: ap.id,
      } as never,
    });
    await client.invoice.create({
      data: {
        vendorId: vendorA.id,
        invoiceNumber: `AGE-120-${Date.now()}`,
        invoiceDate: new Date(),
        dueDate: daysAgo(120),
        taxMinorUnits: 0,
        totalMinorUnits: 300,
        status: 'APPROVED_FOR_PAYMENT',
        createdById: ap.id,
      } as never,
    });

    const result = await service.apAging(org.id);
    expect(result.current).toBeGreaterThanOrEqual(100);
    expect(result.days31To60).toBeGreaterThanOrEqual(200);
    expect(result.days90Plus).toBeGreaterThanOrEqual(300);
  });

  it('computes invoice-to-payment cycle time from submittedAt to the release payment date', async () => {
    const client = forOrg(prisma, org.id);
    const submittedAt = new Date(Date.now() - 10 * DAY_MS);
    const paymentDate = new Date();

    const invoice = await client.invoice.create({
      data: {
        vendorId: vendorA.id,
        invoiceNumber: `CYCLE-${Date.now()}`,
        invoiceDate: submittedAt,
        submittedAt,
        taxMinorUnits: 0,
        totalMinorUnits: 100,
        paidAmountMinorUnits: 100,
        status: 'PAID',
        createdById: ap.id,
      } as never,
    });
    const batch = await client.paymentBatch.create({
      data: {
        createdById: ap.id,
        totalAmountMinorUnits: 100,
        status: 'RELEASED',
        paymentDate,
        releasedById: ap.id,
        releasedAt: paymentDate,
      } as never,
    });
    await client.paymentBatchLine.create({
      data: { paymentBatchId: batch.id, invoiceId: invoice.id, amountMinorUnits: 100 } as never,
    });

    const result = await service.invoiceToPaymentCycleTime(org.id);
    expect(result.invoiceCount).toBeGreaterThanOrEqual(1);
    expect(result.averageDays).not.toBeNull();
    expect(result.averageDays).toBeGreaterThan(9);
    expect(result.averageDays).toBeLessThan(11);
  });

  it('computes requisition SLA compliance from whether any approval step escalated', async () => {
    const client = forOrg(prisma, org.id);

    const compliantReq = await client.requisition.create({
      data: {
        requesterId: requester.id,
        costCenterId: costCenter.id,
        department: 'Ops',
        status: 'APPROVED',
      } as never,
    });
    await client.approvalStep.create({
      data: {
        requisitionId: compliantReq.id,
        stepOrder: 1,
        approverUserId: approver.id,
        status: 'APPROVED',
      } as never,
    });

    const escalatedReq = await client.requisition.create({
      data: {
        requesterId: requester.id,
        costCenterId: costCenter.id,
        department: 'Ops',
        status: 'APPROVED',
      } as never,
    });
    await client.approvalStep.create({
      data: {
        requisitionId: escalatedReq.id,
        stepOrder: 1,
        approverUserId: approver.id,
        status: 'APPROVED',
        escalatedAt: new Date(),
      } as never,
    });

    // A DRAFT requisition (never submitted) must not count toward the rate at all.
    await client.requisition.create({
      data: {
        requesterId: requester.id,
        costCenterId: costCenter.id,
        department: 'Ops',
        status: 'DRAFT',
      } as never,
    });

    const result = await service.requisitionSlaCompliance(org.id);
    expect(result.totalSubmitted).toBe(2);
    expect(result.escalatedCount).toBe(1);
    expect(result.compliantCount).toBe(1);
    expect(result.complianceRate).toBe(0.5);
  });
});
