import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalService } from '../approval/approval.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg, type ScopedPrismaClient } from '../prisma/scoped-prisma.js';
import { StorageService } from '../storage/storage.service.js';
import type { CreateRequisitionDto } from './dto/create-requisition.dto.js';
import type { RequisitionLineDto } from './dto/requisition-line.dto.js';
import type { UpdateRequisitionDto } from './dto/update-requisition.dto.js';
import type { UploadAttachmentDto } from './dto/upload-attachment.dto.js';

function estimatedTotal(lines: RequisitionLineDto[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.estimatedUnitPriceMinorUnits, 0);
}

@Injectable()
export class RequisitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalService,
    private readonly storage: StorageService,
  ) {}

  private async replaceLines(
    client: ScopedPrismaClient,
    requisitionId: string,
    lines: RequisitionLineDto[],
  ) {
    await client.requisitionLine.deleteMany({ where: { requisitionId } });
    for (const line of lines) {
      await client.requisitionLine.create({
        data: {
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          estimatedUnitPriceMinorUnits: line.estimatedUnitPriceMinorUnits,
          requisitionId,
        } as never,
      });
    }
  }

  async create(orgId: string, requesterId: string, dto: CreateRequisitionDto) {
    const client = forOrg(this.prisma, orgId);
    const requisition = await client.requisition.create({
      data: {
        requesterId,
        costCenterId: dto.costCenterId,
        department: dto.department,
        neededByDate: dto.neededByDate ? new Date(dto.neededByDate) : undefined,
        justification: dto.justification,
        estimatedTotalMinorUnits: estimatedTotal(dto.lines),
      } as never,
    });

    await this.replaceLines(client, requisition.id, dto.lines);

    await this.audit.record(client, {
      entityType: 'Requisition',
      entityId: requisition.id,
      action: 'create',
      actorId: requesterId,
      after: requisition,
    });

    return this.findOne(orgId, requisition.id);
  }

  async findAll(orgId: string, opts: { status?: string; requesterId?: string } = {}) {
    const client = forOrg(this.prisma, orgId);
    return client.requisition.findMany({
      where: {
        status: opts.status as never,
        requesterId: opts.requesterId,
      },
      include: { lines: true, costCenter: true, requester: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const requisition = await client.requisition.findUnique({
      where: { id },
      include: {
        lines: true,
        attachments: true,
        costCenter: true,
        requester: true,
        approvalSteps: { orderBy: { stepOrder: 'asc' }, include: { approver: true } },
      },
    });
    if (!requisition) {
      throw new NotFoundException(`Requisition ${id} not found`);
    }
    return requisition;
  }

  /** Any authenticated user who can already view the requisition can attach a supporting document to it. */
  async addAttachment(orgId: string, actorId: string, requisitionId: string, dto: UploadAttachmentDto) {
    await this.findOne(orgId, requisitionId); // 404s if it doesn't exist in this org
    const client = forOrg(this.prisma, orgId);

    const bytes = Buffer.from(dto.base64Content, 'base64');
    const key = this.storage.buildKey(orgId, `requisitions/${requisitionId}/${Date.now()}-${dto.fileName}`);
    await this.storage.putObject(orgId, key, bytes, dto.contentType);

    const attachment = await client.requisitionAttachment.create({
      data: { requisitionId, s3Key: key, fileName: dto.fileName } as never,
    });

    await this.audit.record(client, {
      entityType: 'RequisitionAttachment',
      entityId: attachment.id,
      action: 'create',
      actorId,
      after: attachment,
    });

    return attachment;
  }

  async getAttachmentDownloadUrl(orgId: string, requisitionId: string, attachmentId: string) {
    const client = forOrg(this.prisma, orgId);
    const attachment = await client.requisitionAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.requisitionId !== requisitionId) {
      throw new NotFoundException(`Attachment ${attachmentId} not found on requisition ${requisitionId}`);
    }
    const downloadUrl = await this.storage.getDownloadUrl(orgId, attachment.s3Key);
    return { downloadUrl };
  }

  // DRAFT and CHANGES_REQUESTED are both editable — a change request sends
  // the requisition back to the requester to fix and resubmit, per
  // docs/00-prd.md §4.2. Resubmitting always resolves a fresh approval
  // chain (see submit()) rather than resuming mid-chain — a deliberate
  // Phase 0 simplification: if the requisition changed, re-approve
  // everything rather than trust stale sign-offs.
  private async requireEditableOwnedBy(orgId: string, requesterId: string, id: string) {
    const requisition = await this.findOne(orgId, id);
    if (requisition.requesterId !== requesterId) {
      throw new ForbiddenException('Only the requester can modify this requisition');
    }
    if (requisition.status !== 'DRAFT' && requisition.status !== 'CHANGES_REQUESTED') {
      throw new BadRequestException(
        'Only a draft requisition (or one with changes requested) can be edited — withdraw it first',
      );
    }
    return requisition;
  }

  async update(orgId: string, requesterId: string, id: string, dto: UpdateRequisitionDto) {
    const client = forOrg(this.prisma, orgId);
    const before = await this.requireEditableOwnedBy(orgId, requesterId, id);

    const updated = await client.requisition.update({
      where: { id },
      data: {
        costCenterId: dto.costCenterId,
        department: dto.department,
        neededByDate: dto.neededByDate ? new Date(dto.neededByDate) : undefined,
        justification: dto.justification,
        estimatedTotalMinorUnits: dto.lines ? estimatedTotal(dto.lines) : undefined,
      },
    });

    if (dto.lines) {
      await this.replaceLines(client, id, dto.lines);
    }

    await this.audit.record(client, {
      entityType: 'Requisition',
      entityId: id,
      action: 'update',
      actorId: requesterId,
      before,
      after: updated,
    });

    return this.findOne(orgId, id);
  }

  async submit(orgId: string, requesterId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const requisition = await this.requireEditableOwnedBy(orgId, requesterId, id);

    if (requisition.lines.length === 0) {
      throw new BadRequestException('Cannot submit a requisition with no line items');
    }

    await this.approvals.createChainForRequisition(orgId, requisition);

    const updated = await client.requisition.update({
      where: { id },
      data: { status: 'SUBMITTED' },
    });

    await this.audit.record(client, {
      entityType: 'Requisition',
      entityId: id,
      action: 'submit',
      actorId: requesterId,
      before: { status: requisition.status },
      after: { status: updated.status },
    });

    return this.findOne(orgId, id);
  }

  async withdraw(orgId: string, requesterId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const requisition = await this.findOne(orgId, id);

    if (requisition.requesterId !== requesterId) {
      throw new ForbiddenException('Only the requester can withdraw this requisition');
    }
    if (requisition.status !== 'SUBMITTED' && requisition.status !== 'CHANGES_REQUESTED') {
      throw new BadRequestException(
        'Only a submitted requisition (or one with changes requested) can be withdrawn',
      );
    }

    const updated = await client.requisition.update({
      where: { id },
      data: { status: 'WITHDRAWN' },
    });

    await this.audit.record(client, {
      entityType: 'Requisition',
      entityId: id,
      action: 'withdraw',
      actorId: requesterId,
      before: { status: requisition.status },
      after: { status: updated.status },
    });

    return this.findOne(orgId, id);
  }

  async clone(orgId: string, requesterId: string, id: string) {
    const source = await this.findOne(orgId, id);
    return this.create(orgId, requesterId, {
      costCenterId: source.costCenterId,
      department: source.department,
      justification: source.justification ?? undefined,
      lines: source.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        estimatedUnitPriceMinorUnits: line.estimatedUnitPriceMinorUnits,
      })),
    });
  }
}
