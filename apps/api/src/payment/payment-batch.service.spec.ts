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
import { PaymentBatchService } from './payment-batch.service.js';

describe('PaymentBatchService (P2P-060..062)', () => {
  const prisma = new PrismaService();
  const audit = new AuditService();
  const service = new PaymentBatchService(prisma, audit);

  let org: { id: string };
  let ap: { id: string };
  let controller: { id: string };
  let vendor: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await createTestOrg(prisma);
    ap = await createTestUser(prisma, org.id, ['AP']);
    controller = await createTestUser(prisma, org.id, ['CONTROLLER']);
    vendor = await createTestVendor(prisma, org.id);
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  async function createApprovedInvoice(totalMinorUnits: number) {
    const client = forOrg(prisma, org.id);
    return client.invoice.create({
      data: {
        vendorId: vendor.id,
        invoiceNumber: `PB-${Date.now()}-${Math.random()}`,
        invoiceDate: new Date(),
        taxMinorUnits: 0,
        subtotalMinorUnits: totalMinorUnits,
        totalMinorUnits,
        status: 'APPROVED_FOR_PAYMENT',
        createdById: ap.id,
      } as never,
    });
  }

  it('creates a small batch directly in DRAFT (below the approval threshold)', async () => {
    const invoice = await createApprovedInvoice(1000);
    const batch = await service.create(org.id, ap.id, {
      lines: [{ invoiceId: invoice.id, amountMinorUnits: 1000 }],
    });

    expect(batch.status).toBe('DRAFT');
    expect(batch.totalAmountMinorUnits).toBe(1000);
  });

  it('creates a large batch in PENDING_APPROVAL (above the default 500000 threshold)', async () => {
    const invoice = await createApprovedInvoice(600_000);
    const batch = await service.create(org.id, ap.id, {
      lines: [{ invoiceId: invoice.id, amountMinorUnits: 600_000 }],
    });

    expect(batch.status).toBe('PENDING_APPROVAL');
  });

  it('rejects batching an invoice that is not APPROVED_FOR_PAYMENT', async () => {
    const client = forOrg(prisma, org.id);
    const draftInvoice = await client.invoice.create({
      data: {
        vendorId: vendor.id,
        invoiceNumber: `NOTAPPROVED-${Date.now()}`,
        invoiceDate: new Date(),
        taxMinorUnits: 0,
        totalMinorUnits: 100,
        status: 'DRAFT',
        createdById: ap.id,
      } as never,
    });

    await expect(
      service.create(org.id, ap.id, {
        lines: [{ invoiceId: draftInvoice.id, amountMinorUnits: 100 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an amount exceeding the invoice’s remaining balance', async () => {
    const invoice = await createApprovedInvoice(500);
    await expect(
      service.create(org.id, ap.id, { lines: [{ invoiceId: invoice.id, amountMinorUnits: 600 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('releases a small batch directly from DRAFT and marks the invoice PAID', async () => {
    const invoice = await createApprovedInvoice(1000);
    const batch = await service.create(org.id, ap.id, {
      lines: [{ invoiceId: invoice.id, amountMinorUnits: 1000 }],
    });

    const released = await service.release(org.id, ap.id, batch.id, {
      method: 'bank_transfer',
      referenceNumber: 'REF-1',
      paymentDate: new Date().toISOString(),
    });
    expect(released.status).toBe('RELEASED');

    const client = forOrg(prisma, org.id);
    const updatedInvoice = await client.invoice.findUnique({ where: { id: invoice.id } });
    expect(updatedInvoice?.status).toBe('PAID');
    expect(updatedInvoice?.paidAmountMinorUnits).toBe(1000);
  });

  it('rejects releasing an over-threshold batch without Controller approval, even called directly (P2P-061 AC)', async () => {
    const invoice = await createApprovedInvoice(600_000);
    const batch = await service.create(org.id, ap.id, {
      lines: [{ invoiceId: invoice.id, amountMinorUnits: 600_000 }],
    });
    expect(batch.status).toBe('PENDING_APPROVAL');

    await expect(
      service.release(org.id, ap.id, batch.id, {
        method: 'bank_transfer',
        referenceNumber: 'REF-2',
        paymentDate: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows release once a Controller has approved an over-threshold batch', async () => {
    const invoice = await createApprovedInvoice(600_000);
    const batch = await service.create(org.id, ap.id, {
      lines: [{ invoiceId: invoice.id, amountMinorUnits: 600_000 }],
    });

    const approved = await service.approve(org.id, controller.id, batch.id);
    expect(approved.status).toBe('APPROVED');

    const released = await service.release(org.id, ap.id, batch.id, {
      method: 'bank_transfer',
      referenceNumber: 'REF-3',
      paymentDate: new Date().toISOString(),
    });
    expect(released.status).toBe('RELEASED');
  });

  it('supports a partial payment leaving the invoice APPROVED_FOR_PAYMENT', async () => {
    const invoice = await createApprovedInvoice(1000);
    const batch = await service.create(org.id, ap.id, {
      lines: [{ invoiceId: invoice.id, amountMinorUnits: 400 }],
    });
    await service.release(org.id, ap.id, batch.id, {
      method: 'bank_transfer',
      referenceNumber: 'REF-4',
      paymentDate: new Date().toISOString(),
    });

    const client = forOrg(prisma, org.id);
    const updatedInvoice = await client.invoice.findUnique({ where: { id: invoice.id } });
    expect(updatedInvoice?.status).toBe('APPROVED_FOR_PAYMENT');
    expect(updatedInvoice?.paidAmountMinorUnits).toBe(400);
  });

  it('supports one batch covering multiple invoices', async () => {
    const invoiceA = await createApprovedInvoice(300);
    const invoiceB = await createApprovedInvoice(700);
    const batch = await service.create(org.id, ap.id, {
      lines: [
        { invoiceId: invoiceA.id, amountMinorUnits: 300 },
        { invoiceId: invoiceB.id, amountMinorUnits: 700 },
      ],
    });
    expect(batch.totalAmountMinorUnits).toBe(1000);

    const released = await service.release(org.id, ap.id, batch.id, {
      method: 'bank_transfer',
      referenceNumber: 'REF-5',
      paymentDate: new Date().toISOString(),
    });

    const client = forOrg(prisma, org.id);
    const a = await client.invoice.findUnique({ where: { id: invoiceA.id } });
    const b = await client.invoice.findUnique({ where: { id: invoiceB.id } });
    expect(a?.status).toBe('PAID');
    expect(b?.status).toBe('PAID');
    expect(released.lines).toHaveLength(2);
  });

  it('rejects cancelling an already-released batch', async () => {
    const invoice = await createApprovedInvoice(1000);
    const batch = await service.create(org.id, ap.id, {
      lines: [{ invoiceId: invoice.id, amountMinorUnits: 1000 }],
    });
    await service.release(org.id, ap.id, batch.id, {
      method: 'bank_transfer',
      referenceNumber: 'REF-6',
      paymentDate: new Date().toISOString(),
    });

    await expect(service.cancel(org.id, ap.id, batch.id, 'changed my mind')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
