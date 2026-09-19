import type { PrismaService } from '../prisma/prisma.service.js';

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export async function createTestOrg(prisma: PrismaService) {
  return prisma.org.create({ data: { name: unique('org') } });
}

export async function createTestUser(
  prisma: PrismaService,
  orgId: string,
  roles: string[] = ['REQUESTER'],
) {
  const tag = unique('user');
  return prisma.user.create({
    data: {
      orgId,
      centralLoginId: tag,
      email: `${tag}@example.test`,
      displayName: tag,
      roles: roles as never,
    },
  });
}

export async function createTestCostCenter(
  prisma: PrismaService,
  orgId: string,
  department = 'Ops',
) {
  const tag = unique('cc');
  return prisma.costCenter.create({ data: { orgId, code: tag, name: tag, department } });
}

export async function createTestVendor(
  prisma: PrismaService,
  orgId: string,
  contactEmail?: string,
) {
  const tag = unique('vendor');
  const vendor = await prisma.vendor.create({ data: { orgId, legalName: tag } });
  if (contactEmail) {
    await prisma.vendorContact.create({
      data: { orgId, vendorId: vendor.id, name: 'Contact', email: contactEmail },
    });
  }
  return vendor;
}

/** Deletes everything created under this org, in FK-safe order. */
export async function cleanupOrg(prisma: PrismaService, orgId: string) {
  await prisma.approvalStep.deleteMany({ where: { orgId } });
  await prisma.approvalRuleStep.deleteMany({ where: { orgId } });
  await prisma.approvalRule.deleteMany({ where: { orgId } });
  await prisma.matchException.deleteMany({ where: { orgId } });
  await prisma.invoiceLine.deleteMany({ where: { orgId } });
  await prisma.invoice.deleteMany({ where: { orgId } });
  await prisma.gRNLine.deleteMany({ where: { orgId } });
  await prisma.goodsReceipt.deleteMany({ where: { orgId } });
  await prisma.serviceConfirmation.deleteMany({ where: { orgId } });
  await prisma.pOLineRequisitionLine.deleteMany({ where: { orgId } });
  await prisma.pOLine.deleteMany({ where: { orgId } });
  await prisma.purchaseOrder.deleteMany({ where: { orgId } });
  await prisma.requisitionAttachment.deleteMany({ where: { orgId } });
  await prisma.requisitionLine.deleteMany({ where: { orgId } });
  await prisma.requisition.deleteMany({ where: { orgId } });
  await prisma.vendorContact.deleteMany({ where: { orgId } });
  await prisma.vendor.deleteMany({ where: { orgId } });
  await prisma.auditLogEntry.deleteMany({ where: { orgId } });
  await prisma.costCenter.deleteMany({ where: { orgId } });
  await prisma.user.updateMany({ where: { orgId }, data: { managerId: null } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.org.delete({ where: { id: orgId } });
}
