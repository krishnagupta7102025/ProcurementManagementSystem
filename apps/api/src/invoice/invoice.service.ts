import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg, type ScopedPrismaClient } from '../prisma/scoped-prisma.js';
import type { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import type { InvoiceLineDto } from './dto/invoice-line.dto.js';
import type { UpdateInvoiceDto } from './dto/update-invoice.dto.js';
import { MatchingService } from './matching.service.js';

// If true, even a clean (auto-matched) invoice needs an explicit AP
// sign-off before payment; otherwise a clean match auto-approves
// (P2P-052 AC allows either policy).
const REQUIRE_AP_SIGNOFF_ON_CLEAN_MATCH = process.env.INVOICE_REQUIRE_AP_SIGNOFF === 'true';

function computeTotals(lines: InvoiceLineDto[], taxMinorUnits: number) {
  const subtotalMinorUnits = lines.reduce((sum, l) => sum + l.quantity * l.unitPriceMinorUnits, 0);
  return { subtotalMinorUnits, totalMinorUnits: subtotalMinorUnits + taxMinorUnits };
}

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly matching: MatchingService,
  ) {}

  /**
   * P2P-051: exactDuplicate (same vendor + number + total) should hard-block
   * submission; sameNumberDifferentAmount is a softer flag surfaced to the
   * user before they submit, never blocking on its own.
   */
  async checkDuplicate(
    orgId: string,
    vendorId: string,
    invoiceNumber: string,
    totalMinorUnits: number,
  ) {
    const client = forOrg(this.prisma, orgId);
    const candidates = await client.invoice.findMany({ where: { vendorId, invoiceNumber } });
    return {
      exactDuplicate: candidates.some((c) => c.totalMinorUnits === totalMinorUnits),
      sameNumberDifferentAmount: candidates.some((c) => c.totalMinorUnits !== totalMinorUnits),
    };
  }

  private async replaceLines(
    client: ScopedPrismaClient,
    invoiceId: string,
    lines: InvoiceLineDto[],
  ) {
    await client.invoiceLine.deleteMany({ where: { invoiceId } });
    for (const line of lines) {
      await client.invoiceLine.create({
        data: {
          invoiceId,
          poLineId: line.poLineId,
          description: line.description,
          quantity: line.quantity,
          unitPriceMinorUnits: line.unitPriceMinorUnits,
        } as never,
      });
    }
  }

  async create(orgId: string, actorId: string, dto: CreateInvoiceDto) {
    const client = forOrg(this.prisma, orgId);
    const { subtotalMinorUnits, totalMinorUnits } = computeTotals(dto.lines, dto.taxMinorUnits);

    const duplicate = await this.checkDuplicate(
      orgId,
      dto.vendorId,
      dto.invoiceNumber,
      totalMinorUnits,
    );
    if (duplicate.exactDuplicate) {
      throw new BadRequestException(
        `An invoice with number "${dto.invoiceNumber}" and the same total already exists for this vendor`,
      );
    }

    const invoice = await client.invoice.create({
      data: {
        vendorId: dto.vendorId,
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: new Date(dto.invoiceDate),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        taxMinorUnits: dto.taxMinorUnits,
        subtotalMinorUnits,
        totalMinorUnits,
        createdById: actorId,
      } as never,
    });

    await this.replaceLines(client, invoice.id, dto.lines);

    await this.audit.record(client, {
      entityType: 'Invoice',
      entityId: invoice.id,
      action: 'create',
      actorId,
      after: { ...invoice, duplicateWarning: duplicate.sameNumberDifferentAmount },
    });

    return this.findOne(orgId, invoice.id);
  }

  async findAll(orgId: string, opts: { status?: string; vendorId?: string } = {}) {
    const client = forOrg(this.prisma, orgId);
    return client.invoice.findMany({
      where: { status: opts.status as never, vendorId: opts.vendorId },
      include: { vendor: true, lines: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const invoice = await client.invoice.findUnique({
      where: { id },
      include: {
        vendor: true,
        createdBy: true,
        lines: { include: { poLine: true } },
        matchExceptions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    return invoice;
  }

  private async requireDraftOwnedByAnyone(orgId: string, id: string) {
    const invoice = await this.findOne(orgId, id);
    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException(
        `Only a draft invoice can be edited (currently ${invoice.status})`,
      );
    }
    return invoice;
  }

  async update(orgId: string, actorId: string, id: string, dto: UpdateInvoiceDto) {
    const client = forOrg(this.prisma, orgId);
    const before = await this.requireDraftOwnedByAnyone(orgId, id);

    const totals = dto.lines
      ? computeTotals(dto.lines, dto.taxMinorUnits ?? before.taxMinorUnits)
      : undefined;

    const updated = await client.invoice.update({
      where: { id },
      data: {
        vendorId: dto.vendorId,
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        taxMinorUnits: dto.taxMinorUnits,
        subtotalMinorUnits: totals?.subtotalMinorUnits,
        totalMinorUnits: totals?.totalMinorUnits,
      },
    });

    if (dto.lines) {
      await this.replaceLines(client, id, dto.lines);
    }

    await this.audit.record(client, {
      entityType: 'Invoice',
      entityId: id,
      action: 'update',
      actorId,
      before,
      after: updated,
    });

    return this.findOne(orgId, id);
  }

  /**
   * P2P-050 AC: must link to at least one PO (i.e., have at least one
   * line) before submission. Runs the matching engine synchronously
   * (P2P-052) and routes the invoice accordingly.
   */
  async submit(orgId: string, actorId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const invoice = await this.requireDraftOwnedByAnyone(orgId, id);

    if (invoice.lines.length === 0) {
      throw new BadRequestException('Cannot submit an invoice with no lines linked to a PO');
    }

    await client.invoice.update({ where: { id }, data: { status: 'SUBMITTED' } });

    const result = await this.matching.match(orgId, id);

    if (result.ok) {
      const nextStatus = REQUIRE_AP_SIGNOFF_ON_CLEAN_MATCH ? 'MATCHED' : 'APPROVED_FOR_PAYMENT';
      await client.invoice.update({ where: { id }, data: { status: nextStatus } });
      await this.audit.record(client, {
        entityType: 'Invoice',
        entityId: id,
        action: 'match_clean',
        actorId,
        after: { status: nextStatus, matchLines: result.lines },
      });
    } else {
      await client.invoice.update({ where: { id }, data: { status: 'MATCH_EXCEPTION' } });
      await client.matchException.create({
        data: { invoiceId: id, diff: result.lines } as never,
      });
      await this.audit.record(client, {
        entityType: 'Invoice',
        entityId: id,
        action: 'match_exception',
        actorId,
        after: { status: 'MATCH_EXCEPTION', matchLines: result.lines },
      });
    }

    return this.findOne(orgId, id);
  }

  /** Manual AP sign-off on an already-clean match, when org policy requires it. */
  async approveMatched(orgId: string, actorId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const invoice = await this.findOne(orgId, id);

    if (invoice.status !== 'MATCHED') {
      throw new BadRequestException(`Invoice is ${invoice.status}, not awaiting AP sign-off`);
    }

    const updated = await client.invoice.update({
      where: { id },
      data: { status: 'APPROVED_FOR_PAYMENT' },
    });

    await this.audit.record(client, {
      entityType: 'Invoice',
      entityId: id,
      action: 'ap_approve',
      actorId,
      before: { status: invoice.status },
      after: { status: updated.status },
    });

    return this.findOne(orgId, id);
  }

  async void(orgId: string, actorId: string, id: string, reason: string) {
    const client = forOrg(this.prisma, orgId);
    const invoice = await this.findOne(orgId, id);

    if (invoice.status === 'PAID') {
      throw new ForbiddenException('A paid invoice cannot be voided');
    }

    const updated = await client.invoice.update({ where: { id }, data: { status: 'VOID' } });

    await this.audit.record(client, {
      entityType: 'Invoice',
      entityId: id,
      action: 'void',
      actorId,
      before: { status: invoice.status },
      after: { status: updated.status, reason },
    });

    return this.findOne(orgId, id);
  }
}
