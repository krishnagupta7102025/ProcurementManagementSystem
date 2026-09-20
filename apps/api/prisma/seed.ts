// Demo seed (P2P-081): a fresh org, cost centers, vendors, and a full
// sample requisition -> payment chain, built by calling the real services
// (not raw inserts) so every status transition, audit entry, and
// side-effect (PO issuing, GRN-driven status updates, matching, payment)
// happens exactly the way it would for a real user. Safe to re-run: any
// prior "Losung360 Demo Co" org is torn down first (reusing the same
// cleanupOrg the test suite uses), so re-running always leaves exactly one
// fresh copy rather than piling up duplicates — centralLoginId is globally
// unique, so accumulating duplicate demo orgs isn't an option anyway.
import 'dotenv/config';
import { AuditService } from '../src/audit/audit.service.js';
import { ApprovalRuleService } from '../src/approval/approval-rule.service.js';
import { ApprovalService } from '../src/approval/approval.service.js';
import { GoodsReceiptService } from '../src/goods-receipt/goods-receipt.service.js';
import { InvoiceService } from '../src/invoice/invoice.service.js';
import { MatchingService } from '../src/invoice/matching.service.js';
import { PaymentBatchService } from '../src/payment/payment-batch.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PurchaseOrderService } from '../src/purchase-order/purchase-order.service.js';
import { RequisitionService } from '../src/requisition/requisition.service.js';
import { cleanupOrg } from '../src/test-utils/seed-helpers.js';
import { VendorService } from '../src/vendor/vendor.service.js';

const DEMO_ORG_NAME = 'Losung360 Demo Co';

// Minimal stand-ins for the two integrations Phase 0 doesn't have real
// providers for yet (S3 upload, outbound email) — same pattern the test
// suite uses, since PurchaseOrderService needs both but the seed never
// actually needs a working PDF/email round trip.
function stubStorage() {
  return {
    buildKey: (orgId: string, path: string) => `${orgId}/${path}`,
    putObject: async () => {},
    getUploadUrl: async () => '',
    getDownloadUrl: async () => '',
  } as never;
}
function stubEmail() {
  return { send: async () => {} } as never;
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const audit = new AuditService();
  const vendors = new VendorService(prisma, audit);
  const approvalRules = new ApprovalRuleService(prisma, audit);
  const approvals = new ApprovalService(prisma, audit, approvalRules);
  const requisitions = new RequisitionService(prisma, audit, approvals);
  const purchaseOrders = new PurchaseOrderService(prisma, audit, stubStorage(), stubEmail());
  const goodsReceipts = new GoodsReceiptService(prisma, audit);
  const matching = new MatchingService(prisma);
  const invoices = new InvoiceService(prisma, audit, matching);
  const paymentBatches = new PaymentBatchService(prisma, audit);

  const existing = await prisma.org.findMany({ where: { name: DEMO_ORG_NAME } });
  for (const previous of existing) {
    console.log(`Removing previous demo org ${previous.id}...`);
    await cleanupOrg(prisma, previous.id);
  }

  console.log('Creating demo org...');
  const org = await prisma.org.create({ data: { name: DEMO_ORG_NAME, baseCurrency: 'INR' } });

  const [requester, approver, buyer, receiver, ap, controller, admin] = await Promise.all([
    prisma.user.create({
      data: {
        orgId: org.id,
        centralLoginId: 'demo-requester',
        email: 'requester@demo.p2p',
        displayName: 'Rita Requester',
        roles: ['REQUESTER'],
      },
    }),
    prisma.user.create({
      data: {
        orgId: org.id,
        centralLoginId: 'demo-approver',
        email: 'approver@demo.p2p',
        displayName: 'Alan Approver',
        roles: ['APPROVER'],
      },
    }),
    prisma.user.create({
      data: {
        orgId: org.id,
        centralLoginId: 'demo-buyer',
        email: 'buyer@demo.p2p',
        displayName: 'Bella Buyer',
        roles: ['BUYER'],
      },
    }),
    prisma.user.create({
      data: {
        orgId: org.id,
        centralLoginId: 'demo-receiver',
        email: 'receiver@demo.p2p',
        displayName: 'Ravi Receiver',
        roles: ['RECEIVER'],
      },
    }),
    prisma.user.create({
      data: {
        orgId: org.id,
        centralLoginId: 'demo-ap',
        email: 'ap@demo.p2p',
        displayName: 'Amy AP',
        roles: ['AP'],
      },
    }),
    prisma.user.create({
      data: {
        orgId: org.id,
        centralLoginId: 'demo-controller',
        email: 'controller@demo.p2p',
        displayName: 'Carl Controller',
        roles: ['CONTROLLER'],
      },
    }),
    prisma.user.create({
      data: {
        orgId: org.id,
        centralLoginId: 'demo-admin',
        email: 'admin@demo.p2p',
        displayName: 'Ada Admin',
        roles: ['ADMIN'],
      },
    }),
  ]);

  console.log('Creating cost centers...');
  const engineering = await prisma.costCenter.create({
    data: { orgId: org.id, code: 'ENG-001', name: 'Engineering', department: 'Engineering' },
  });
  await prisma.costCenter.create({
    data: { orgId: org.id, code: 'MKT-001', name: 'Marketing', department: 'Marketing' },
  });

  console.log('Creating vendors...');
  const acme = await vendors.create(org.id, admin.id, {
    legalName: 'Acme Supplies Pvt Ltd',
    gstin: '29ABCDE1234F1Z5',
    contacts: [{ name: 'Priya Vendor', email: 'priya@acmesupplies.example' }],
  });
  await vendors.create(org.id, admin.id, { legalName: 'Global Traders Inc' });

  console.log('Creating the default approval rule...');
  await approvalRules.create(org.id, admin.id, {
    name: 'Default: any dept, any amount → Approver',
    steps: [{ stepOrder: 1, approverUserId: approver.id }],
  });

  console.log('Walking a full requisition → payment chain...');

  const requisition = await requisitions.create(org.id, requester.id, {
    costCenterId: engineering.id,
    department: 'Engineering',
    justification: 'New laptops for the engineering team',
    lines: [
      { description: 'Laptop', quantity: 5, unit: 'unit', estimatedUnitPriceMinorUnits: 15_000_00 },
    ],
  });
  const submittedRequisition = await requisitions.submit(org.id, requester.id, requisition.id);
  await approvals.act(org.id, approver.id, submittedRequisition.id, 'approve', undefined);

  const approvedRequisition = await requisitions.findOne(org.id, requisition.id);
  const requisitionLine = approvedRequisition.lines[0];

  const po = await purchaseOrders.create(org.id, buyer.id, {
    vendorId: acme.id,
    lines: [
      {
        description: 'Laptop',
        quantity: 5,
        unit: 'unit',
        unitPriceMinorUnits: 15_000_00,
        allocations: [{ requisitionLineId: requisitionLine.id, quantity: 5 }],
      },
    ],
  });
  const issuedPo = await purchaseOrders.issue(org.id, buyer.id, po.id);
  const poLine = issuedPo.lines[0];

  await goodsReceipts.recordGrn(org.id, receiver.id, ['RECEIVER'], po.id, {
    lines: [{ poLineId: poLine.id, quantityReceived: 5 }],
  });

  const invoice = await invoices.create(org.id, ap.id, {
    vendorId: acme.id,
    invoiceNumber: 'ACME-INV-1001',
    invoiceDate: new Date().toISOString(),
    taxMinorUnits: 0,
    lines: [
      { poLineId: poLine.id, description: 'Laptop', quantity: 5, unitPriceMinorUnits: 15_000_00 },
    ],
  });
  const submittedInvoice = await invoices.submit(org.id, ap.id, invoice.id);
  console.log(`  Invoice matched cleanly → ${submittedInvoice.status}`);

  const batch = await paymentBatches.create(org.id, ap.id, {
    lines: [{ invoiceId: invoice.id, amountMinorUnits: submittedInvoice.totalMinorUnits }],
  });
  if (batch.status === 'PENDING_APPROVAL') {
    await paymentBatches.approve(org.id, controller.id, batch.id);
  }
  await paymentBatches.release(org.id, ap.id, batch.id, {
    method: 'bank_transfer',
    referenceNumber: 'DEMO-TXN-0001',
    paymentDate: new Date().toISOString(),
  });
  console.log(`  Payment released → invoice is now PAID`);

  console.log(`\nDone. Demo org id: ${org.id}`);
  console.log(
    `Demo users (all roles share this org): requester/approver/buyer/receiver/ap/controller/admin@demo.p2p`,
  );
  console.log(
    `Controller user id (for approving over-threshold payment batches): ${controller.id}`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
