import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { AuditService } from '../audit/audit.service.js';
import { convertToBaseCurrency } from '../common/fx.util.js';
import { EMAIL_SERVICE, type EmailService } from '../email/email.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg, type ScopedPrismaClient } from '../prisma/scoped-prisma.js';
import { StorageService } from '../storage/storage.service.js';
import type { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';

// How far the negotiated total can exceed the linked requisition(s)'
// estimate before a PO needs a second approval before it can be issued
// (P2P-031). Configurable rather than hardcoded at 10%, per the ticket.
const VARIANCE_TOLERANCE = Number(process.env.PO_VARIANCE_TOLERANCE ?? 0.1);

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
  ) {}

  async create(orgId: string, buyerId: string, dto: CreatePurchaseOrderDto) {
    const client = forOrg(this.prisma, orgId);

    const vendor = await client.vendor.findUnique({ where: { id: dto.vendorId } });
    if (!vendor) {
      throw new NotFoundException(`Vendor ${dto.vendorId} not found`);
    }
    if (vendor.status !== 'ACTIVE') {
      throw new BadRequestException(`Vendor is ${vendor.status} and cannot receive new POs`);
    }

    await this.assertAllocationsAreValid(client, dto);

    const negotiatedTotalMinorUnits = dto.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitPriceMinorUnits,
      0,
    );

    const org = await this.prisma.org.findUniqueOrThrow({ where: { id: orgId } });
    const currency = dto.currency ?? org.baseCurrency;
    const { fxRateToBase, baseCurrencyTotalMinorUnits } = convertToBaseCurrency(
      currency,
      org.baseCurrency,
      negotiatedTotalMinorUnits,
      dto.fxRateToBase,
    );

    const po = await client.purchaseOrder.create({
      data: {
        vendorId: dto.vendorId,
        buyerId,
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
        billToAddress: dto.billToAddress,
        shipToAddress: dto.shipToAddress,
        negotiatedTotalMinorUnits,
        currency,
        fxRateToBase,
        baseCurrencyTotalMinorUnits,
      } as never,
    });

    for (const line of dto.lines) {
      const poLine = await client.pOLine.create({
        data: {
          purchaseOrderId: po.id,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceMinorUnits: line.unitPriceMinorUnits,
          isService: line.isService ?? false,
        } as never,
      });

      for (const allocation of line.allocations) {
        await client.pOLineRequisitionLine.create({
          data: {
            poLineId: poLine.id,
            requisitionLineId: allocation.requisitionLineId,
            quantity: allocation.quantity,
          } as never,
        });
      }
    }

    await this.audit.record(client, {
      entityType: 'PurchaseOrder',
      entityId: po.id,
      action: 'create',
      actorId: buyerId,
      after: po,
    });

    return this.findOne(orgId, po.id);
  }

  /**
   * Every requisition line an allocation points at must (a) belong to an
   * APPROVED requisition in this org, and (b) not be over-allocated across
   * every PO that has ever drawn on it — unless overrideQuantityCheck is
   * set (P2P-030 AC).
   */
  private async assertAllocationsAreValid(client: ScopedPrismaClient, dto: CreatePurchaseOrderDto) {
    const requestedByLineId = new Map<string, number>();
    for (const line of dto.lines) {
      for (const allocation of line.allocations) {
        requestedByLineId.set(
          allocation.requisitionLineId,
          (requestedByLineId.get(allocation.requisitionLineId) ?? 0) + allocation.quantity,
        );
      }
    }

    for (const [requisitionLineId, requestedQuantity] of requestedByLineId) {
      const requisitionLine = await client.requisitionLine.findUnique({
        where: { id: requisitionLineId },
        include: { requisition: true, poLineLinks: true },
      });
      if (!requisitionLine) {
        throw new NotFoundException(`Requisition line ${requisitionLineId} not found`);
      }
      if (requisitionLine.requisition.status !== 'APPROVED') {
        throw new BadRequestException(
          `Requisition ${requisitionLine.requisition.id} is not APPROVED and cannot be converted to a PO`,
        );
      }

      const alreadyAllocated = requisitionLine.poLineLinks.reduce(
        (sum, link) => sum + link.quantity,
        0,
      );
      const totalAfterThis = alreadyAllocated + requestedQuantity;

      if (totalAfterThis > requisitionLine.quantity && !dto.overrideQuantityCheck) {
        throw new BadRequestException(
          `Requisition line "${requisitionLine.description}" requested ${requisitionLine.quantity}, but ${totalAfterThis} would be allocated across POs — set overrideQuantityCheck to allow this`,
        );
      }
    }
  }

  async findAll(orgId: string, opts: { status?: string; vendorId?: string } = {}) {
    const client = forOrg(this.prisma, orgId);
    return client.purchaseOrder.findMany({
      where: { status: opts.status as never, vendorId: opts.vendorId },
      include: { vendor: true, buyer: true, lines: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const po = await client.purchaseOrder.findUnique({
      where: { id },
      include: {
        vendor: { include: { contacts: true } },
        buyer: true,
        lines: { include: { requisitionAllocs: { include: { requisitionLine: true } } } },
      },
    });
    if (!po) {
      throw new NotFoundException(`Purchase order ${id} not found`);
    }
    return po;
  }

  private async linkedRequisitionEstimateTotal(
    client: ScopedPrismaClient,
    poId: string,
  ): Promise<number> {
    const po = await client.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        lines: {
          include: {
            requisitionAllocs: { include: { requisitionLine: { include: { requisition: true } } } },
          },
        },
      },
    });
    const requisitionIds = new Set<string>();
    for (const line of po?.lines ?? []) {
      for (const alloc of line.requisitionAllocs) {
        requisitionIds.add(alloc.requisitionLine.requisition.id);
      }
    }

    const requisitions = await client.requisition.findMany({
      where: { id: { in: [...requisitionIds] } },
    });
    return requisitions.reduce((sum, r) => sum + r.estimatedTotalMinorUnits, 0);
  }

  /**
   * DRAFT -> ISSUED directly if the negotiated total is within tolerance
   * of the linked requisition(s)' estimate; otherwise DRAFT ->
   * PENDING_APPROVAL, which needs a separate approveVariance() call
   * (P2P-031). Not an error either way — both are valid next states.
   */
  async issue(orgId: string, actorId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const po = await this.findOne(orgId, id);

    if (po.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot issue a PO in status ${po.status}`);
    }

    const estimateTotal = await this.linkedRequisitionEstimateTotal(client, id);
    const withinTolerance =
      estimateTotal === 0 ||
      po.negotiatedTotalMinorUnits <= estimateTotal * (1 + VARIANCE_TOLERANCE);
    const nextStatus = withinTolerance ? 'ISSUED' : 'PENDING_APPROVAL';

    const updated = await client.purchaseOrder.update({
      where: { id },
      data: { status: nextStatus },
    });

    await this.audit.record(client, {
      entityType: 'PurchaseOrder',
      entityId: id,
      action: withinTolerance ? 'issue' : 'flag_for_variance_approval',
      actorId,
      before: { status: po.status, estimateTotal },
      after: { status: updated.status },
    });

    return this.findOne(orgId, id);
  }

  async approveVariance(orgId: string, actorId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const po = await this.findOne(orgId, id);

    if (po.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`PO is ${po.status}, not awaiting variance approval`);
    }

    const updated = await client.purchaseOrder.update({
      where: { id },
      data: { status: 'ISSUED' },
    });

    await this.audit.record(client, {
      entityType: 'PurchaseOrder',
      entityId: id,
      action: 'approve_variance',
      actorId,
      before: { status: po.status },
      after: { status: updated.status },
    });

    return this.findOne(orgId, id);
  }

  async cancel(orgId: string, actorId: string, id: string, reason: string) {
    const client = forOrg(this.prisma, orgId);
    const po = await this.findOne(orgId, id);

    if (!['DRAFT', 'PENDING_APPROVAL', 'ISSUED'].includes(po.status)) {
      throw new BadRequestException(`Cannot cancel a PO in status ${po.status}`);
    }

    const updated = await client.purchaseOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    await this.audit.record(client, {
      entityType: 'PurchaseOrder',
      entityId: id,
      action: 'cancel',
      actorId,
      before: { status: po.status },
      after: { status: updated.status, reason },
    });

    return this.findOne(orgId, id);
  }

  async generatePdf(orgId: string, id: string): Promise<string> {
    const po = await this.findOne(orgId, id);

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]); // A4
    let y = 800;
    const line = (text: string, size = 11) => {
      page.drawText(text, { x: 50, y, size, font });
      y -= size + 6;
    };

    line(`Purchase Order ${po.id}`, 16);
    line(`Vendor: ${po.vendor.legalName}`);
    line(`Status: ${po.status}`);
    if (po.deliveryDate) line(`Delivery date: ${po.deliveryDate.toISOString().slice(0, 10)}`);
    y -= 10;
    line('Lines:', 13);
    for (const l of po.lines) {
      line(
        `${l.description} — ${l.quantity} ${l.unit} @ ${l.unitPriceMinorUnits} = ${l.quantity * l.unitPriceMinorUnits}`,
      );
    }
    y -= 10;
    line(`Total: ${po.negotiatedTotalMinorUnits} ${po.currency}`, 13);

    const bytes = await doc.save();
    const key = this.storage.buildKey(orgId, `purchase-orders/${po.id}.pdf`);
    await this.storage.putObject(orgId, key, bytes, 'application/pdf');

    const client = forOrg(this.prisma, orgId);
    await client.purchaseOrder.update({ where: { id }, data: { pdfS3Key: key } });

    return key;
  }

  /** Generates the PDF if it doesn't exist yet, then returns a URL the frontend can link to directly. */
  async getPdfDownloadUrl(orgId: string, id: string): Promise<{ downloadUrl: string }> {
    const po = await this.findOne(orgId, id);
    const key = po.pdfS3Key ?? (await this.generatePdf(orgId, id));
    const downloadUrl = await this.storage.getDownloadUrl(orgId, key);
    return { downloadUrl };
  }

  async sendToVendor(orgId: string, actorId: string, id: string, message: string) {
    const client = forOrg(this.prisma, orgId);
    const po = await this.findOne(orgId, id);

    if (po.status !== 'ISSUED') {
      throw new BadRequestException('A PO can only be sent to the vendor once it is ISSUED');
    }

    const contactEmail = po.vendor.contacts.find((c) => c.email)?.email;
    if (!contactEmail) {
      throw new BadRequestException('This vendor has no contact with an email address on file');
    }

    const pdfKey = po.pdfS3Key ?? (await this.generatePdf(orgId, id));

    await this.email.send({
      to: contactEmail,
      subject: `Purchase Order ${po.id} from ${po.buyer.displayName}`,
      body: message,
      attachmentS3Key: pdfKey,
    });

    const updated = await client.purchaseOrder.update({
      where: { id },
      data: { sentToVendorAt: new Date() },
    });

    await this.audit.record(client, {
      entityType: 'PurchaseOrder',
      entityId: id,
      action: 'send_to_vendor',
      actorId,
      after: { sentToVendorAt: updated.sentToVendorAt, contactEmail },
    });

    return this.findOne(orgId, id);
  }
}
