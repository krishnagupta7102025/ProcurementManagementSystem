import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg, type ScopedPrismaClient } from '../prisma/scoped-prisma.js';
import type { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto.js';

// Over-receipt beyond this fraction of a PO line's ordered quantity is
// blocked unless overridden (P2P-040 AC). Default 0% — any over-receipt
// at all needs a Buyer's explicit sign-off, per docs/00-prd.md §4.4.
const OVER_RECEIPT_TOLERANCE = Number(process.env.GRN_OVER_RECEIPT_TOLERANCE ?? 0);

const RECEIVABLE_PO_STATUSES = new Set(['ISSUED', 'PARTIALLY_RECEIVED']);

@Injectable()
export class GoodsReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async loadReceivablePo(client: ScopedPrismaClient, poId: string) {
    const po = await client.purchaseOrder.findUnique({
      where: { id: poId },
      include: { lines: true },
    });
    if (!po) {
      throw new NotFoundException(`Purchase order ${poId} not found`);
    }
    if (!RECEIVABLE_PO_STATUSES.has(po.status)) {
      throw new BadRequestException(`Cannot receive against a PO in status ${po.status}`);
    }
    return po;
  }

  async recordGrn(
    orgId: string,
    actorId: string,
    actorRoles: Role[],
    poId: string,
    dto: CreateGoodsReceiptDto,
  ) {
    const client = forOrg(this.prisma, orgId);
    const po = await this.loadReceivablePo(client, poId);

    const lineById = new Map(po.lines.map((l) => [l.id, l]));
    const overrideLineNotes: { poLineId: string; overQuantity: number }[] = [];

    for (const grnLine of dto.lines) {
      const poLine = lineById.get(grnLine.poLineId);
      if (!poLine) {
        throw new NotFoundException(`PO line ${grnLine.poLineId} does not belong to this PO`);
      }
      if (poLine.isService) {
        throw new BadRequestException(
          `PO line ${grnLine.poLineId} is a service line — use service confirmation instead`,
        );
      }

      const existing = await client.gRNLine.aggregate({
        where: { poLineId: grnLine.poLineId },
        _sum: { quantityReceived: true },
      });
      const alreadyReceived = existing._sum.quantityReceived ?? 0;
      const totalAfterThis = alreadyReceived + grnLine.quantityReceived;
      const allowedMax = poLine.quantity * (1 + OVER_RECEIPT_TOLERANCE);

      if (totalAfterThis > allowedMax) {
        if (!dto.overrideReason) {
          throw new BadRequestException(
            `PO line "${poLine.description}" ordered ${poLine.quantity}, but ${totalAfterThis} would be received — a Buyer override with a reason is required`,
          );
        }
        if (!actorRoles.includes('BUYER') && !actorRoles.includes('ADMIN')) {
          throw new ForbiddenException('Only a Buyer can override an over-receipt block');
        }
        overrideLineNotes.push({
          poLineId: grnLine.poLineId,
          overQuantity: totalAfterThis - poLine.quantity,
        });
      }
    }

    const overriddenLineIds = new Set(overrideLineNotes.map((o) => o.poLineId));

    const receipt = await client.goodsReceipt.create({
      data: {
        purchaseOrderId: poId,
        receivedById: actorId,
        receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : undefined,
        notes: dto.notes,
      } as never,
    });

    for (const grnLine of dto.lines) {
      await client.gRNLine.create({
        data: {
          goodsReceiptId: receipt.id,
          poLineId: grnLine.poLineId,
          quantityReceived: grnLine.quantityReceived,
          conditionNotes: grnLine.conditionNotes,
          overrideReason: overriddenLineIds.has(grnLine.poLineId) ? dto.overrideReason : undefined,
        } as never,
      });
    }

    await this.audit.record(client, {
      entityType: 'GoodsReceipt',
      entityId: receipt.id,
      action: 'create',
      actorId,
      after: { ...receipt, lines: dto.lines, overrides: overrideLineNotes },
    });

    await this.recomputePoStatus(client, poId);

    return this.findOne(orgId, receipt.id);
  }

  async confirmService(
    orgId: string,
    actorId: string,
    poId: string,
    poLineId: string,
    notes: string | undefined,
  ) {
    const client = forOrg(this.prisma, orgId);
    const po = await this.loadReceivablePo(client, poId);

    const poLine = po.lines.find((l) => l.id === poLineId);
    if (!poLine) {
      throw new NotFoundException(`PO line ${poLineId} does not belong to this PO`);
    }
    if (!poLine.isService) {
      throw new BadRequestException(
        `PO line ${poLineId} is a physical line — use goods receipt instead`,
      );
    }

    const existing = await client.serviceConfirmation.findUnique({ where: { poLineId } });
    if (existing) {
      throw new BadRequestException(`PO line ${poLineId} has already been confirmed`);
    }

    const confirmation = await client.serviceConfirmation.create({
      data: { poLineId, confirmedById: actorId, notes } as never,
    });

    await this.audit.record(client, {
      entityType: 'ServiceConfirmation',
      entityId: confirmation.id,
      action: 'confirm',
      actorId,
      after: confirmation,
    });

    await this.recomputePoStatus(client, poId);

    return confirmation;
  }

  /** P2P-042: recomputes PARTIALLY_RECEIVED / FULLY_RECEIVED from cumulative GRN + service-confirmation completeness. */
  private async recomputePoStatus(client: ScopedPrismaClient, poId: string) {
    const po = await client.purchaseOrder.findUnique({
      where: { id: poId },
      include: { lines: { include: { grnLines: true, serviceConfirmation: true } } },
    });
    if (!po) return;

    let anyProgress = false;
    let allComplete = true;

    for (const line of po.lines) {
      if (line.isService) {
        const done = line.serviceConfirmation !== null;
        if (done) anyProgress = true;
        if (!done) allComplete = false;
      } else {
        const received = line.grnLines.reduce((sum, g) => sum + g.quantityReceived, 0);
        if (received > 0) anyProgress = true;
        if (received < line.quantity) allComplete = false;
      }
    }

    const nextStatus = allComplete
      ? 'FULLY_RECEIVED'
      : anyProgress
        ? 'PARTIALLY_RECEIVED'
        : po.status;
    if (nextStatus !== po.status) {
      await client.purchaseOrder.update({ where: { id: poId }, data: { status: nextStatus } });
    }
  }

  async findOne(orgId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const receipt = await client.goodsReceipt.findUnique({
      where: { id },
      include: { lines: { include: { poLine: true } }, receivedBy: true },
    });
    if (!receipt) {
      throw new NotFoundException(`Goods receipt ${id} not found`);
    }
    return receipt;
  }

  async findAllForPo(orgId: string, purchaseOrderId: string) {
    const client = forOrg(this.prisma, orgId);
    return client.goodsReceipt.findMany({
      where: { purchaseOrderId },
      include: { lines: { include: { poLine: true } }, receivedBy: true },
      orderBy: { receivedDate: 'desc' },
    });
  }
}
