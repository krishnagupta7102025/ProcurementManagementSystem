import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import {
  cleanupOrg,
  createTestOrg,
  createTestUser,
  createTestVendor,
  fakeStorage,
} from '../test-utils/seed-helpers.js';
import { InvoiceService } from './invoice.service.js';
import { MatchExceptionService } from './match-exception.service.js';
import { MatchingService } from './matching.service.js';

describe('MatchExceptionService (P2P-053)', () => {
  const prisma = new PrismaService();
  const audit = new AuditService();
  const matching = new MatchingService(prisma);
  const invoices = new InvoiceService(prisma, audit, matching, fakeStorage());
  const exceptions = new MatchExceptionService(prisma, audit, matching, invoices);

  let org: { id: string };
  let ap: { id: string };
  let admin: { id: string };
  let buyer: { id: string };
  let vendor: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await createTestOrg(prisma);
    ap = await createTestUser(prisma, org.id, ['AP']);
    admin = await createTestUser(prisma, org.id, ['ADMIN']);
    buyer = await createTestUser(prisma, org.id, ['BUYER']);
    vendor = await createTestVendor(prisma, org.id);
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  async function createMismatchedInvoice() {
    const client = forOrg(prisma, org.id);
    const po = await client.purchaseOrder.create({
      data: { vendorId: vendor.id, buyerId: buyer.id, status: 'ISSUED' } as never,
    });
    const line = await client.pOLine.create({
      data: {
        purchaseOrderId: po.id,
        description: 'Widget',
        quantity: 10,
        unit: 'unit',
        unitPriceMinorUnits: 100,
      } as never,
    });
    const receipt = await client.goodsReceipt.create({
      data: { purchaseOrderId: po.id, receivedById: buyer.id } as never,
    });
    await client.gRNLine.create({
      data: { goodsReceiptId: receipt.id, poLineId: line.id, quantityReceived: 10 } as never,
    });

    const invoice = await invoices.create(org.id, ap.id, {
      vendorId: vendor.id,
      invoiceNumber: `EXC-${Date.now()}-${Math.random()}`,
      invoiceDate: new Date().toISOString(),
      taxMinorUnits: 0,
      lines: [{ poLineId: line.id, description: 'Widget', quantity: 10, unitPriceMinorUnits: 500 }],
    });
    const submitted = await invoices.submit(org.id, ap.id, invoice.id);
    return { line, invoice: submitted, exceptionId: submitted.matchExceptions[0].id };
  }

  it('resolves via request-credit-note without changing the invoice out of MATCH_EXCEPTION', async () => {
    const { exceptionId, invoice } = await createMismatchedInvoice();

    const resolved = await exceptions.requestCreditNote(
      org.id,
      ap.id,
      exceptionId,
      'vendor overbilled',
    );
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolutionAction).toBe('credit_note_requested');

    const stillInvoice = await invoices.findOne(org.id, invoice.id);
    expect(stillInvoice.status).toBe('MATCH_EXCEPTION');
  });

  it('resolves via adjust-and-rematch, moving the invoice forward when the fix is clean', async () => {
    const { exceptionId, line } = await createMismatchedInvoice();

    const resubmitted = await exceptions.adjustAndRematch(org.id, ap.id, exceptionId, [
      { poLineId: line.id, description: 'Widget', quantity: 10, unitPriceMinorUnits: 100 },
    ]);

    expect(resubmitted.status).toBe('APPROVED_FOR_PAYMENT');

    const exception = await exceptions.findOne(org.id, exceptionId);
    expect(exception.status).toBe('RESOLVED');
    expect(exception.resolutionAction).toBe('adjusted_rematch');
  });

  it('resolves via manual-override, forcing the invoice to APPROVED_FOR_PAYMENT with an audited reason', async () => {
    const { exceptionId, invoice } = await createMismatchedInvoice();

    const resolved = await exceptions.manualOverride(
      org.id,
      admin.id,
      exceptionId,
      'CFO approved despite variance',
    );
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolutionAction).toBe('manual_override');

    const updatedInvoice = await invoices.findOne(org.id, invoice.id);
    expect(updatedInvoice.status).toBe('APPROVED_FOR_PAYMENT');
  });

  it('rejects acting on an already-resolved exception', async () => {
    const { exceptionId } = await createMismatchedInvoice();
    await exceptions.requestCreditNote(org.id, ap.id, exceptionId, 'first resolution');

    await expect(
      exceptions.requestCreditNote(org.id, ap.id, exceptionId, 'second'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
