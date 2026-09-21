import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApprovalRuleService } from '../approval/approval-rule.service.js';
import { ApprovalService } from '../approval/approval.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { EmailMessage, EmailService } from '../email/email.interface.js';
import { GoodsReceiptService } from '../goods-receipt/goods-receipt.service.js';
import { InvoiceService } from '../invoice/invoice.service.js';
import { MatchingService } from '../invoice/matching.service.js';
import { PaymentBatchService } from '../payment/payment-batch.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PurchaseOrderService } from '../purchase-order/purchase-order.service.js';
import { RequisitionService } from '../requisition/requisition.service.js';
import {
  cleanupOrg,
  createTestCostCenter,
  createTestOrg,
  createTestUser,
  createTestVendor,
  fakeStorage,
} from '../test-utils/seed-helpers.js';
import { VendorService } from '../vendor/vendor.service.js';

class RecordingEmailService implements EmailService {
  sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

/**
 * P2P-082: the full Phase 0 loop, end to end, as one continuous flow —
 * requisition -> approval -> PO -> goods receipt -> invoice -> clean match
 * -> payment. Every step calls the real service (never a raw Prisma
 * shortcut), so this is the closest thing Phase 0 has to "does the whole
 * product actually work," and it's what should catch a regression in any
 * one epic breaking the chain for another.
 */
describe('Full P2P happy path (P2P-082)', () => {
  const prisma = new PrismaService();
  const audit = new AuditService();

  const vendorsSvc = new VendorService(prisma, audit);
  const approvalRules = new ApprovalRuleService(prisma, audit);
  const approvals = new ApprovalService(prisma, audit, approvalRules);
  const requisitions = new RequisitionService(prisma, audit, approvals, fakeStorage());
  const purchaseOrders = new PurchaseOrderService(
    prisma,
    audit,
    fakeStorage(),
    new RecordingEmailService(),
  );
  const goodsReceipts = new GoodsReceiptService(prisma, audit);
  const matching = new MatchingService(prisma);
  const invoices = new InvoiceService(prisma, audit, matching, fakeStorage());
  const paymentBatches = new PaymentBatchService(prisma, audit);

  let org: { id: string };
  let requester: { id: string };
  let approver: { id: string };
  let buyer: { id: string };
  let receiver: { id: string };
  let ap: { id: string };
  let costCenter: { id: string };
  let vendor: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await createTestOrg(prisma);
    requester = await createTestUser(prisma, org.id, ['REQUESTER']);
    approver = await createTestUser(prisma, org.id, ['APPROVER']);
    buyer = await createTestUser(prisma, org.id, ['BUYER']);
    receiver = await createTestUser(prisma, org.id, ['RECEIVER']);
    ap = await createTestUser(prisma, org.id, ['AP']);
    costCenter = await createTestCostCenter(prisma, org.id, 'Engineering');
    vendor = await createTestVendor(prisma, org.id);

    await approvalRules.create(org.id, approver.id, {
      name: 'Default',
      steps: [{ stepOrder: 1, approverUserId: approver.id }],
    });
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  it('walks a requisition all the way through to a paid invoice', async () => {
    // 1. Requisition: created, submitted, approved.
    const requisition = await requisitions.create(org.id, requester.id, {
      costCenterId: costCenter.id,
      department: 'Engineering',
      justification: 'New monitors',
      lines: [
        { description: 'Monitor', quantity: 4, unit: 'unit', estimatedUnitPriceMinorUnits: 20_000 },
      ],
    });
    expect(requisition.status).toBe('DRAFT');

    const submittedRequisition = await requisitions.submit(org.id, requester.id, requisition.id);
    expect(submittedRequisition.status).toBe('SUBMITTED');
    expect(submittedRequisition.approvalSteps).toHaveLength(1);

    await approvals.act(org.id, approver.id, submittedRequisition.id, 'approve', undefined);
    const approvedRequisition = await requisitions.findOne(org.id, requisition.id);
    expect(approvedRequisition.status).toBe('APPROVED');
    const requisitionLine = approvedRequisition.lines[0];

    // 2. Purchase order: created from the approved requisition line, issued.
    const po = await purchaseOrders.create(org.id, buyer.id, {
      vendorId: vendor.id,
      lines: [
        {
          description: 'Monitor',
          quantity: 4,
          unit: 'unit',
          unitPriceMinorUnits: 20_000,
          allocations: [{ requisitionLineId: requisitionLine.id, quantity: 4 }],
        },
      ],
    });
    expect(po.status).toBe('DRAFT');
    expect(po.lines[0].requisitionAllocs[0].requisitionLineId).toBe(requisitionLine.id);

    const issuedPo = await purchaseOrders.issue(org.id, buyer.id, po.id);
    expect(issuedPo.status).toBe('ISSUED'); // within variance tolerance of the requisition estimate
    const poLine = issuedPo.lines[0];

    // 3. Goods receipt: full quantity received in one shot.
    await goodsReceipts.recordGrn(org.id, receiver.id, ['RECEIVER'], po.id, {
      lines: [{ poLineId: poLine.id, quantityReceived: 4 }],
    });
    const receivedPo = await purchaseOrders.findOne(org.id, po.id);
    expect(receivedPo.status).toBe('FULLY_RECEIVED');

    // 4. Invoice: linked to the PO line, submitted, matches cleanly.
    const invoice = await invoices.create(org.id, ap.id, {
      vendorId: vendor.id,
      invoiceNumber: `E2E-${Date.now()}`,
      invoiceDate: new Date().toISOString(),
      taxMinorUnits: 0,
      lines: [
        { poLineId: poLine.id, description: 'Monitor', quantity: 4, unitPriceMinorUnits: 20_000 },
      ],
    });
    const submittedInvoice = await invoices.submit(org.id, ap.id, invoice.id);
    expect(submittedInvoice.status).toBe('APPROVED_FOR_PAYMENT');
    expect(submittedInvoice.matchExceptions).toHaveLength(0);
    expect(submittedInvoice.totalMinorUnits).toBe(80_000);

    // 5. Payment: batched and released, invoice fully paid.
    const batch = await paymentBatches.create(org.id, ap.id, {
      lines: [{ invoiceId: invoice.id, amountMinorUnits: submittedInvoice.totalMinorUnits }],
    });
    expect(batch.status).toBe('DRAFT'); // well under the approval threshold

    const released = await paymentBatches.release(org.id, ap.id, batch.id, {
      method: 'bank_transfer',
      referenceNumber: 'E2E-TXN-1',
      paymentDate: new Date().toISOString(),
    });
    expect(released.status).toBe('RELEASED');

    const paidInvoice = await invoices.findOne(org.id, invoice.id);
    expect(paidInvoice.status).toBe('PAID');
    expect(paidInvoice.paidAmountMinorUnits).toBe(80_000);

    // The vendor row created at the top of this test never touches contacts,
    // but the service layer used throughout should never have needed to —
    // confirms VendorService itself is wired correctly into this chain too.
    const finalVendor = await vendorsSvc.findOne(org.id, vendor.id);
    expect(finalVendor.status).toBe('ACTIVE');
  });
});
