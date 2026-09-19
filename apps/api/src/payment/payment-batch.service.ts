import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import type { CreatePaymentBatchDto } from './dto/create-payment-batch.dto.js';
import type { ReleasePaymentBatchDto } from './dto/release-payment-batch.dto.js';

// Batches above this need Controller/Admin approval before release
// (P2P-061). Default ₹5,000 (in paise) — arbitrary but configurable.
const APPROVAL_THRESHOLD = Number(process.env.PAYMENT_BATCH_APPROVAL_THRESHOLD ?? 500000);

@Injectable()
export class PaymentBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Candidate invoices for a new batch — the filtering surface from P2P-060. */
  async findApprovedInvoices(
    orgId: string,
    filters: {
      vendorId?: string;
      dueBefore?: string;
      minAmount?: number;
      maxAmount?: number;
      costCenterId?: string;
    },
  ) {
    const client = forOrg(this.prisma, orgId);
    return client.invoice.findMany({
      where: {
        status: 'APPROVED_FOR_PAYMENT',
        vendorId: filters.vendorId,
        dueDate: filters.dueBefore ? { lte: new Date(filters.dueBefore) } : undefined,
        totalMinorUnits: { gte: filters.minAmount, lte: filters.maxAmount },
        lines: filters.costCenterId
          ? {
              some: {
                poLine: {
                  requisitionAllocs: {
                    some: {
                      requisitionLine: { requisition: { costCenterId: filters.costCenterId } },
                    },
                  },
                },
              },
            }
          : undefined,
      },
      include: { vendor: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async create(orgId: string, actorId: string, dto: CreatePaymentBatchDto) {
    const client = forOrg(this.prisma, orgId);

    let totalAmountMinorUnits = 0;
    for (const line of dto.lines) {
      const invoice = await client.invoice.findUnique({ where: { id: line.invoiceId } });
      if (!invoice) {
        throw new NotFoundException(`Invoice ${line.invoiceId} not found`);
      }
      if (invoice.status !== 'APPROVED_FOR_PAYMENT') {
        throw new BadRequestException(
          `Invoice ${line.invoiceId} is ${invoice.status}, not APPROVED_FOR_PAYMENT`,
        );
      }
      const remaining = invoice.totalMinorUnits - invoice.paidAmountMinorUnits;
      if (line.amountMinorUnits > remaining) {
        throw new BadRequestException(
          `Invoice ${line.invoiceId} has ${remaining} remaining, but ${line.amountMinorUnits} was requested`,
        );
      }
      totalAmountMinorUnits += line.amountMinorUnits;
    }

    // Batches over threshold start life awaiting approval — there's
    // nothing else to prepare between "selected the invoices" and "ready
    // for a Controller to look at it" (P2P-061).
    const status = totalAmountMinorUnits > APPROVAL_THRESHOLD ? 'PENDING_APPROVAL' : 'DRAFT';

    const batch = await client.paymentBatch.create({
      data: { createdById: actorId, totalAmountMinorUnits, status } as never,
    });

    for (const line of dto.lines) {
      await client.paymentBatchLine.create({
        data: {
          paymentBatchId: batch.id,
          invoiceId: line.invoiceId,
          amountMinorUnits: line.amountMinorUnits,
        } as never,
      });
    }

    await this.audit.record(client, {
      entityType: 'PaymentBatch',
      entityId: batch.id,
      action: 'create',
      actorId,
      after: batch,
    });

    return this.findOne(orgId, batch.id);
  }

  async findAll(orgId: string, opts: { status?: string } = {}) {
    const client = forOrg(this.prisma, orgId);
    return client.paymentBatch.findMany({
      where: { status: opts.status as never },
      include: { lines: { include: { invoice: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const batch = await client.paymentBatch.findUnique({
      where: { id },
      include: {
        lines: { include: { invoice: { include: { vendor: true } } } },
        createdBy: true,
        approvedBy: true,
        releasedBy: true,
      },
    });
    if (!batch) {
      throw new NotFoundException(`Payment batch ${id} not found`);
    }
    return batch;
  }

  async approve(orgId: string, actorId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const batch = await this.findOne(orgId, id);

    if (batch.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Batch is ${batch.status}, not awaiting approval`);
    }

    const updated = await client.paymentBatch.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: actorId, approvedAt: new Date() },
    });

    await this.audit.record(client, {
      entityType: 'PaymentBatch',
      entityId: id,
      action: 'approve',
      actorId,
      before: { status: batch.status },
      after: { status: updated.status },
    });

    return this.findOne(orgId, id);
  }

  /**
   * P2P-061 AC: re-verifies the approval requirement independently of the
   * status field, rather than trusting that APPROVED can only be reached
   * through approve() — release() is the one place money actually moves,
   * so it re-derives "does this need approval" from the amount itself.
   */
  async release(orgId: string, actorId: string, id: string, dto: ReleasePaymentBatchDto) {
    const client = forOrg(this.prisma, orgId);
    const batch = await this.findOne(orgId, id);

    if (batch.status === 'RELEASED' || batch.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot release a batch that is already ${batch.status}`);
    }

    const needsApproval = batch.totalAmountMinorUnits > APPROVAL_THRESHOLD;
    if (needsApproval && !(batch.status === 'APPROVED' && batch.approvedById)) {
      throw new ForbiddenException(
        `This batch (${batch.totalAmountMinorUnits}) exceeds the approval threshold (${APPROVAL_THRESHOLD}) and has not been approved by a Controller/Admin`,
      );
    }

    const updated = await client.paymentBatch.update({
      where: { id },
      data: {
        status: 'RELEASED',
        method: dto.method,
        referenceNumber: dto.referenceNumber,
        paymentDate: new Date(dto.paymentDate),
        releasedById: actorId,
        releasedAt: new Date(),
      },
    });

    for (const line of batch.lines) {
      const invoice = line.invoice;
      const newPaidAmount = invoice.paidAmountMinorUnits + line.amountMinorUnits;
      await client.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmountMinorUnits: newPaidAmount,
          status: newPaidAmount >= invoice.totalMinorUnits ? 'PAID' : invoice.status,
        },
      });
    }

    await this.audit.record(client, {
      entityType: 'PaymentBatch',
      entityId: id,
      action: 'release',
      actorId,
      before: { status: batch.status },
      after: { status: updated.status, method: dto.method, referenceNumber: dto.referenceNumber },
    });

    return this.findOne(orgId, id);
  }

  async cancel(orgId: string, actorId: string, id: string, reason: string) {
    const client = forOrg(this.prisma, orgId);
    const batch = await this.findOne(orgId, id);

    if (batch.status === 'RELEASED' || batch.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot cancel a batch that is already ${batch.status}`);
    }

    const updated = await client.paymentBatch.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    await this.audit.record(client, {
      entityType: 'PaymentBatch',
      entityId: id,
      action: 'cancel',
      actorId,
      before: { status: batch.status },
      after: { status: updated.status, reason },
    });

    return this.findOne(orgId, id);
  }
}
