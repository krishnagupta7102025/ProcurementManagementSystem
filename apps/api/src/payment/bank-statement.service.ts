import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';

interface ParsedRow {
  transactionDate: Date;
  description: string;
  amountMinorUnits: number;
  reference?: string;
}

/**
 * Minimal CSV parsing — one row per line, comma-separated, an optional
 * surrounding pair of double quotes per field (no embedded commas/newlines
 * inside a quoted field). Good enough for a structured bank export; a
 * real CSV library would be overkill for Phase 0's one column format.
 */
function parseCsv(csv: string): ParsedRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new BadRequestException('CSV must have a header row plus at least one data row');
  }

  const unquote = (cell: string) => cell.trim().replace(/^"(.*)"$/, '$1');

  return lines.slice(1).map((line, index) => {
    const cells = line.split(',').map(unquote);
    const [dateStr, description, amountStr, reference] = cells;
    const transactionDate = new Date(dateStr);
    const amountMinorUnits = Number(amountStr);

    if (Number.isNaN(transactionDate.getTime()) || !description || Number.isNaN(amountMinorUnits)) {
      throw new BadRequestException(`Row ${index + 2} is malformed: "${line}"`);
    }

    return { transactionDate, description, amountMinorUnits, reference: reference || undefined };
  });
}

@Injectable()
export class BankStatementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async importCsv(orgId: string, actorId: string, csv: string) {
    const client = forOrg(this.prisma, orgId);
    const rows = parseCsv(csv);

    const created = [];
    for (const row of rows) {
      created.push(await client.bankStatementLine.create({ data: row as never }));
    }

    await this.audit.record(client, {
      entityType: 'BankStatementImport',
      entityId: 'bulk',
      action: 'import',
      actorId,
      after: { count: created.length },
    });

    return created;
  }

  async findAll(orgId: string, opts: { unmatchedOnly?: boolean } = {}) {
    const client = forOrg(this.prisma, orgId);
    return client.bankStatementLine.findMany({
      where: opts.unmatchedOnly ? { matchedPaymentBatchId: null } : undefined,
      orderBy: { transactionDate: 'desc' },
    });
  }

  /** Matches a bank line to a released PaymentBatch, marking the batch Cleared (P2P-063). */
  async reconcile(
    orgId: string,
    actorId: string,
    bankStatementLineId: string,
    paymentBatchId: string,
  ) {
    const client = forOrg(this.prisma, orgId);

    const line = await client.bankStatementLine.findUnique({ where: { id: bankStatementLineId } });
    if (!line) {
      throw new NotFoundException(`Bank statement line ${bankStatementLineId} not found`);
    }
    if (line.matchedPaymentBatchId) {
      throw new BadRequestException('This bank statement line is already reconciled');
    }

    const batch = await client.paymentBatch.findUnique({ where: { id: paymentBatchId } });
    if (!batch) {
      throw new NotFoundException(`Payment batch ${paymentBatchId} not found`);
    }
    if (batch.status !== 'RELEASED') {
      throw new BadRequestException('Only a released payment batch can be reconciled');
    }

    const updatedLine = await client.bankStatementLine.update({
      where: { id: bankStatementLineId },
      data: { matchedPaymentBatchId: paymentBatchId, matchedById: actorId, matchedAt: new Date() },
    });

    await client.paymentBatch.update({
      where: { id: paymentBatchId },
      data: { clearedAt: new Date() },
    });

    await this.audit.record(client, {
      entityType: 'BankStatementLine',
      entityId: bankStatementLineId,
      action: 'reconcile',
      actorId,
      after: { matchedPaymentBatchId: paymentBatchId },
    });

    return updatedLine;
  }
}
