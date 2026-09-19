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
import { InvoiceService } from './invoice.service.js';
import { MatchingService } from './matching.service.js';

describe('InvoiceService (P2P-050..052)', () => {
  const prisma = new PrismaService();
  const audit = new AuditService();
  const matching = new MatchingService(prisma);
  const service = new InvoiceService(prisma, audit, matching);

  let org: { id: string };
  let ap: { id: string };
  let buyer: { id: string };
  let vendor: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await createTestOrg(prisma);
    ap = await createTestUser(prisma, org.id, ['AP']);
    buyer = await createTestUser(prisma, org.id, ['BUYER']);
    vendor = await createTestVendor(prisma, org.id);
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  /** An ISSUED PO with one fully-received physical line, ready to invoice cleanly. */
  async function createReceivablePoLine(quantity = 10, unitPriceMinorUnits = 100) {
    const client = forOrg(prisma, org.id);
    const po = await client.purchaseOrder.create({
      data: { vendorId: vendor.id, buyerId: buyer.id, status: 'ISSUED' } as never,
    });
    const line = await client.pOLine.create({
      data: {
        purchaseOrderId: po.id,
        description: 'Widget',
        quantity,
        unit: 'unit',
        unitPriceMinorUnits,
      } as never,
    });
    const receipt = await client.goodsReceipt.create({
      data: { purchaseOrderId: po.id, receivedById: buyer.id } as never,
    });
    await client.gRNLine.create({
      data: { goodsReceiptId: receipt.id, poLineId: line.id, quantityReceived: quantity } as never,
    });
    return { po, line };
  }

  it('computes subtotal/total from lines and tax', async () => {
    const { line } = await createReceivablePoLine(10, 100);
    const invoice = await service.create(org.id, ap.id, {
      vendorId: vendor.id,
      invoiceNumber: `INV-${Date.now()}`,
      invoiceDate: new Date().toISOString(),
      taxMinorUnits: 50,
      lines: [{ poLineId: line.id, description: 'Widget', quantity: 10, unitPriceMinorUnits: 100 }],
    });

    expect(invoice.subtotalMinorUnits).toBe(1000);
    expect(invoice.totalMinorUnits).toBe(1050);
    expect(invoice.status).toBe('DRAFT');
  });

  it('blocks an exact duplicate (same vendor + number + total), but only flags a same-number-different-amount as a warning', async () => {
    const { line } = await createReceivablePoLine(10, 100);
    const invoiceNumber = `DUP-${Date.now()}`;

    await service.create(org.id, ap.id, {
      vendorId: vendor.id,
      invoiceNumber,
      invoiceDate: new Date().toISOString(),
      taxMinorUnits: 0,
      lines: [{ poLineId: line.id, description: 'Widget', quantity: 10, unitPriceMinorUnits: 100 }],
    });

    await expect(
      service.create(org.id, ap.id, {
        vendorId: vendor.id,
        invoiceNumber,
        invoiceDate: new Date().toISOString(),
        taxMinorUnits: 0,
        lines: [
          { poLineId: line.id, description: 'Widget', quantity: 10, unitPriceMinorUnits: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const softDuplicateCheck = await service.checkDuplicate(org.id, vendor.id, invoiceNumber, 999);
    expect(softDuplicateCheck.exactDuplicate).toBe(false);
    expect(softDuplicateCheck.sameNumberDifferentAmount).toBe(true);

    // A different amount under the same vendor+number does NOT hard-block.
    const secondInvoice = await service.create(org.id, ap.id, {
      vendorId: vendor.id,
      invoiceNumber,
      invoiceDate: new Date().toISOString(),
      taxMinorUnits: 50,
      lines: [{ poLineId: line.id, description: 'Widget', quantity: 1, unitPriceMinorUnits: 1 }],
    });
    expect(secondInvoice.id).toBeTruthy();
  });

  it('rejects submitting an invoice with no lines (P2P-050 AC)', async () => {
    const invoice = await service.create(org.id, ap.id, {
      vendorId: vendor.id,
      invoiceNumber: `EMPTY-${Date.now()}`,
      invoiceDate: new Date().toISOString(),
      taxMinorUnits: 0,
      lines: [],
    });

    await expect(service.submit(org.id, ap.id, invoice.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('auto-approves a clean match on submit (P2P-052)', async () => {
    const { line } = await createReceivablePoLine(10, 100);
    const invoice = await service.create(org.id, ap.id, {
      vendorId: vendor.id,
      invoiceNumber: `CLEAN-${Date.now()}`,
      invoiceDate: new Date().toISOString(),
      taxMinorUnits: 0,
      lines: [{ poLineId: line.id, description: 'Widget', quantity: 10, unitPriceMinorUnits: 100 }],
    });

    const submitted = await service.submit(org.id, ap.id, invoice.id);
    expect(submitted.status).toBe('APPROVED_FOR_PAYMENT');
    expect(submitted.matchExceptions).toHaveLength(0);
  });

  it('routes a price mismatch to MATCH_EXCEPTION with a diff payload (P2P-052 AC)', async () => {
    const { line } = await createReceivablePoLine(10, 100);
    const invoice = await service.create(org.id, ap.id, {
      vendorId: vendor.id,
      invoiceNumber: `MISMATCH-${Date.now()}`,
      invoiceDate: new Date().toISOString(),
      taxMinorUnits: 0,
      lines: [{ poLineId: line.id, description: 'Widget', quantity: 10, unitPriceMinorUnits: 500 }], // way over PO price
    });

    const submitted = await service.submit(org.id, ap.id, invoice.id);
    expect(submitted.status).toBe('MATCH_EXCEPTION');
    expect(submitted.matchExceptions).toHaveLength(1);
    expect(submitted.matchExceptions[0].status).toBe('OPEN');
    expect(Array.isArray(submitted.matchExceptions[0].diff)).toBe(true);
  });

  it('only allows editing a DRAFT invoice', async () => {
    const { line } = await createReceivablePoLine(10, 100);
    const invoice = await service.create(org.id, ap.id, {
      vendorId: vendor.id,
      invoiceNumber: `EDIT-${Date.now()}`,
      invoiceDate: new Date().toISOString(),
      taxMinorUnits: 0,
      lines: [{ poLineId: line.id, description: 'Widget', quantity: 10, unitPriceMinorUnits: 100 }],
    });
    await service.submit(org.id, ap.id, invoice.id);

    await expect(
      service.update(org.id, ap.id, invoice.id, { invoiceNumber: 'should-fail' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks voiding a PAID invoice', async () => {
    const { line } = await createReceivablePoLine(1, 100);
    const invoice = await service.create(org.id, ap.id, {
      vendorId: vendor.id,
      invoiceNumber: `PAID-${Date.now()}`,
      invoiceDate: new Date().toISOString(),
      taxMinorUnits: 0,
      lines: [{ poLineId: line.id, description: 'Widget', quantity: 1, unitPriceMinorUnits: 100 }],
    });
    const client = forOrg(prisma, org.id);
    await client.invoice.update({ where: { id: invoice.id }, data: { status: 'PAID' } });

    await expect(service.void(org.id, ap.id, invoice.id, 'oops')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
