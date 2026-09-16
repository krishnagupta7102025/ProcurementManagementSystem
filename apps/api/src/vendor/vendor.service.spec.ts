import { NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { VendorService } from './vendor.service.js';

describe('VendorService (P2P-010, P2P-011)', () => {
  const prisma = new PrismaService();
  const service = new VendorService(prisma, new AuditService());
  let org: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await prisma.org.create({ data: { name: 'Vendor Test Org' } });
  });

  afterAll(async () => {
    await prisma.auditLogEntry.deleteMany({ where: { orgId: org.id } });
    await prisma.vendorContact.deleteMany({ where: { orgId: org.id } });
    await prisma.vendor.deleteMany({ where: { orgId: org.id } });
    await prisma.org.delete({ where: { id: org.id } });
    await prisma.$disconnect();
  });

  it('creates a vendor with contacts and writes an audit entry', async () => {
    const vendor = await service.create(org.id, 'actor-1', {
      legalName: 'Acme Supplies',
      gstin: '29ABCDE1234F1Z5',
      contacts: [{ name: 'Jane Buyer', email: 'jane@acme.test' }],
    });

    expect(vendor.legalName).toBe('Acme Supplies');
    expect(vendor.status).toBe('ACTIVE');
    expect(vendor.contacts).toHaveLength(1);
    expect(vendor.contacts[0].name).toBe('Jane Buyer');

    const auditEntries = await prisma.auditLogEntry.findMany({
      where: { orgId: org.id, entityType: 'Vendor', entityId: vendor.id },
    });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].action).toBe('create');
  });

  it('excludes On Hold / Blacklisted vendors from the active-only picker (P2P-010 AC)', async () => {
    const active = await service.create(org.id, 'actor-1', { legalName: 'Active Vendor' });
    const onHold = await service.create(org.id, 'actor-1', { legalName: 'On Hold Vendor' });
    const blacklisted = await service.create(org.id, 'actor-1', {
      legalName: 'Blacklisted Vendor',
    });

    await service.updateStatus(org.id, 'actor-1', onHold.id, 'ON_HOLD');
    await service.updateStatus(org.id, 'actor-1', blacklisted.id, 'BLACKLISTED');

    const pickerList = await service.findAll(org.id, { activeOnly: true });
    const pickerIds = pickerList.map((v) => v.id);

    expect(pickerIds).toContain(active.id);
    expect(pickerIds).not.toContain(onHold.id);
    expect(pickerIds).not.toContain(blacklisted.id);

    const fullList = await service.findAll(org.id);
    expect(fullList.map((v) => v.id)).toEqual(
      expect.arrayContaining([active.id, onHold.id, blacklisted.id]),
    );
  });

  it('records a status_change audit entry with before/after', async () => {
    const vendor = await service.create(org.id, 'actor-1', { legalName: 'Status Audit Vendor' });
    await service.updateStatus(org.id, 'actor-2', vendor.id, 'ON_HOLD');

    const statusChanges = await prisma.auditLogEntry.findMany({
      where: { orgId: org.id, entityType: 'Vendor', entityId: vendor.id, action: 'status_change' },
    });
    expect(statusChanges).toHaveLength(1);
    expect(statusChanges[0].actorId).toBe('actor-2');
    expect(statusChanges[0].before).toEqual({ status: 'ACTIVE' });
    expect(statusChanges[0].after).toEqual({ status: 'ON_HOLD' });
  });

  it('throws NotFoundException for a vendor id that does not exist in the org', async () => {
    await expect(service.findOne(org.id, 'does-not-exist')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('spend summary returns a stable zeroed shape pending Epic D/F (P2P-011)', async () => {
    const vendor = await service.create(org.id, 'actor-1', { legalName: 'Spend Summary Vendor' });
    const summary = await service.getSpendSummary(org.id, vendor.id);

    expect(summary).toEqual({
      vendorId: vendor.id,
      totalCommittedMinorUnits: 0,
      totalPaidMinorUnits: 0,
      avgInvoiceToPaymentDays: null,
    });
  });
});
