import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import type { InvoiceLineDto } from './dto/invoice-line.dto.js';
import { InvoiceService } from './invoice.service.js';
import { MatchingService } from './matching.service.js';

@Injectable()
export class MatchExceptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly matching: MatchingService,
    private readonly invoices: InvoiceService,
  ) {}

  async findAll(orgId: string, opts: { status?: string } = {}) {
    const client = forOrg(this.prisma, orgId);
    return client.matchException.findMany({
      where: { status: opts.status as never },
      include: { invoice: { include: { vendor: true, lines: { include: { poLine: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const exception = await client.matchException.findUnique({
      where: { id },
      include: { invoice: { include: { vendor: true, lines: { include: { poLine: true } } } } },
    });
    if (!exception) {
      throw new NotFoundException(`Match exception ${id} not found`);
    }
    return exception;
  }

  private async requireOpen(orgId: string, id: string) {
    const exception = await this.findOne(orgId, id);
    if (exception.status !== 'OPEN') {
      throw new BadRequestException(`Match exception ${id} is already ${exception.status}`);
    }
    return exception;
  }

  /** Logs the request; the actual credit note is issued outside this system in Phase 0. */
  async requestCreditNote(orgId: string, actorId: string, id: string, notes: string) {
    const client = forOrg(this.prisma, orgId);
    await this.requireOpen(orgId, id);

    const updated = await client.matchException.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolutionAction: 'credit_note_requested',
        resolutionNotes: notes,
        resolvedById: actorId,
        resolvedAt: new Date(),
      },
    });

    await this.audit.record(client, {
      entityType: 'MatchException',
      entityId: id,
      action: 'request_credit_note',
      actorId,
      after: updated,
    });

    return this.findOne(orgId, id);
  }

  /** Edits the invoice's lines and re-runs matching — resolves this exception either way. */
  async adjustAndRematch(orgId: string, actorId: string, id: string, lines: InvoiceLineDto[]) {
    const client = forOrg(this.prisma, orgId);
    const exception = await this.requireOpen(orgId, id);

    await client.matchException.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolutionAction: 'adjusted_rematch',
        resolvedById: actorId,
        resolvedAt: new Date(),
      },
    });

    await this.audit.record(client, {
      entityType: 'MatchException',
      entityId: id,
      action: 'adjust_and_rematch',
      actorId,
      before: exception,
    });

    // Invoice must go back through DRAFT to be editable, then resubmit —
    // reuses InvoiceService's own validated update/submit path rather than
    // duplicating line-replacement and matching logic here.
    await client.invoice.update({ where: { id: exception.invoiceId }, data: { status: 'DRAFT' } });
    await this.invoices.update(orgId, actorId, exception.invoiceId, { lines });
    return this.invoices.submit(orgId, actorId, exception.invoiceId);
  }

  /** Forces the invoice through despite the mismatch — always audited with the reason. */
  async manualOverride(orgId: string, actorId: string, id: string, reason: string) {
    const client = forOrg(this.prisma, orgId);
    const exception = await this.requireOpen(orgId, id);

    const updated = await client.matchException.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolutionAction: 'manual_override',
        resolutionNotes: reason,
        resolvedById: actorId,
        resolvedAt: new Date(),
      },
    });

    await client.invoice.update({
      where: { id: exception.invoiceId },
      data: { status: 'APPROVED_FOR_PAYMENT' },
    });

    await this.audit.record(client, {
      entityType: 'MatchException',
      entityId: id,
      action: 'manual_override',
      actorId,
      before: exception,
      after: { ...updated, invoiceStatus: 'APPROVED_FOR_PAYMENT' },
    });

    return this.findOne(orgId, id);
  }
}
