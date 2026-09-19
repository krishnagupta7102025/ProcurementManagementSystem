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
} from '../test-utils/seed-helpers.js';
import { BankStatementService } from './bank-statement.service.js';

describe('BankStatementService (P2P-063)', () => {
  const prisma = new PrismaService();
  const audit = new AuditService();
  const service = new BankStatementService(prisma, audit);

  let org: { id: string };
  let ap: { id: string };
  let vendor: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await createTestOrg(prisma);
    ap = await createTestUser(prisma, org.id, ['AP']);
    vendor = await createTestVendor(prisma, org.id);
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  it('imports a valid CSV into bank statement lines', async () => {
    const csv = [
      'date,description,amount,reference',
      '2026-01-15,Vendor payout,100000,TXN-1',
      '2026-01-16,Vendor payout,50000,TXN-2',
    ].join('\n');

    const rows = await service.importCsv(org.id, ap.id, csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].amountMinorUnits).toBe(100000);
    expect(rows[0].reference).toBe('TXN-1');
  });

  it('rejects a malformed CSV row', async () => {
    const csv = ['date,description,amount,reference', 'not-a-date,,notanumber,'].join('\n');
    await expect(service.importCsv(org.id, ap.id, csv)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a CSV with no data rows', async () => {
    await expect(
      service.importCsv(org.id, ap.id, 'date,description,amount,reference'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  async function createReleasedBatch(amount: number) {
    const client = forOrg(prisma, org.id);
    const invoice = await client.invoice.create({
      data: {
        vendorId: vendor.id,
        invoiceNumber: `BANK-${Date.now()}-${Math.random()}`,
        invoiceDate: new Date(),
        taxMinorUnits: 0,
        totalMinorUnits: amount,
        status: 'APPROVED_FOR_PAYMENT',
        createdById: ap.id,
      } as never,
    });
    const batch = await client.paymentBatch.create({
      data: {
        createdById: ap.id,
        totalAmountMinorUnits: amount,
        status: 'RELEASED',
        releasedById: ap.id,
        releasedAt: new Date(),
      } as never,
    });
    await client.paymentBatchLine.create({
      data: { paymentBatchId: batch.id, invoiceId: invoice.id, amountMinorUnits: amount } as never,
    });
    return batch;
  }

  it('reconciles a bank line against a released batch and marks it Cleared', async () => {
    const batch = await createReleasedBatch(100000);
    const [line] = await service.importCsv(
      org.id,
      ap.id,
      ['date,description,amount,reference', '2026-01-15,Vendor payout,100000,TXN-3'].join('\n'),
    );

    const reconciled = await service.reconcile(org.id, ap.id, line.id, batch.id);
    expect(reconciled.matchedPaymentBatchId).toBe(batch.id);

    const client = forOrg(prisma, org.id);
    const updatedBatch = await client.paymentBatch.findUnique({ where: { id: batch.id } });
    expect(updatedBatch?.clearedAt).not.toBeNull();
  });

  it('rejects reconciling against a batch that is not RELEASED', async () => {
    const client = forOrg(prisma, org.id);
    const draftBatch = await client.paymentBatch.create({
      data: { createdById: ap.id, totalAmountMinorUnits: 100, status: 'DRAFT' } as never,
    });
    const [line] = await service.importCsv(
      org.id,
      ap.id,
      ['date,description,amount,reference', '2026-01-15,Unmatched,100,TXN-4'].join('\n'),
    );

    await expect(service.reconcile(org.id, ap.id, line.id, draftBatch.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects reconciling the same bank line twice', async () => {
    const batch = await createReleasedBatch(500);
    const [line] = await service.importCsv(
      org.id,
      ap.id,
      ['date,description,amount,reference', '2026-01-15,Vendor payout,500,TXN-5'].join('\n'),
    );

    await service.reconcile(org.id, ap.id, line.id, batch.id);
    await expect(service.reconcile(org.id, ap.id, line.id, batch.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('findAll(unmatchedOnly) excludes reconciled lines', async () => {
    const batch = await createReleasedBatch(250);
    const [line] = await service.importCsv(
      org.id,
      ap.id,
      ['date,description,amount,reference', '2026-01-15,Vendor payout,250,TXN-6'].join('\n'),
    );
    await service.reconcile(org.id, ap.id, line.id, batch.id);

    const unmatched = await service.findAll(org.id, { unmatchedOnly: true });
    expect(unmatched.map((l) => l.id)).not.toContain(line.id);
  });
});
