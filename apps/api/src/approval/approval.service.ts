import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg, type ScopedPrismaClient } from '../prisma/scoped-prisma.js';
import { ApprovalRuleService } from './approval-rule.service.js';

export type ApprovalAction = 'approve' | 'reject' | 'request_changes';

@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rules: ApprovalRuleService,
  ) {}

  /**
   * Resolves the matching ApprovalRule and snapshots it onto ApprovalStep
   * rows for this requisition (P2P-021). Throws if no rule matches — a
   * requisition can't be submitted into a policy vacuum.
   */
  async createChainForRequisition(
    orgId: string,
    requisition: {
      id: string;
      department: string;
      costCenterId: string;
      estimatedTotalMinorUnits: number;
    },
  ): Promise<void> {
    const rule = await this.rules.resolveRule(orgId, {
      department: requisition.department,
      costCenterId: requisition.costCenterId,
      amountMinorUnits: requisition.estimatedTotalMinorUnits,
    });

    if (!rule) {
      throw new BadRequestException(
        'No approval rule matches this requisition’s department/cost center/amount — ask an admin to configure one before submitting.',
      );
    }

    const client = forOrg(this.prisma, orgId);
    const now = new Date();
    for (const step of rule.steps) {
      await client.approvalStep.create({
        data: {
          requisitionId: requisition.id,
          stepOrder: step.stepOrder,
          approverUserId: step.approverUserId,
          becameActiveAt: step.stepOrder === rule.steps[0].stepOrder ? now : null,
        } as never,
      });
    }
  }

  private async findActiveStep(client: ScopedPrismaClient, requisitionId: string) {
    return client.approvalStep.findFirst({
      where: { requisitionId, status: 'PENDING', becameActiveAt: { not: null } },
      orderBy: { stepOrder: 'asc' },
    });
  }

  async findMyPending(orgId: string, approverUserId: string) {
    const client = forOrg(this.prisma, orgId);
    return client.approvalStep.findMany({
      where: { approverUserId, status: 'PENDING', becameActiveAt: { not: null } },
      include: { requisition: { include: { lines: true, requester: true, costCenter: true } } },
      orderBy: { becameActiveAt: 'asc' },
    });
  }

  async act(
    orgId: string,
    actorId: string,
    requisitionId: string,
    action: ApprovalAction,
    reason: string | undefined,
  ) {
    if ((action === 'reject' || action === 'request_changes') && !reason) {
      throw new BadRequestException('A reason is required to reject or request changes');
    }

    const client = forOrg(this.prisma, orgId);
    const activeStep = await this.findActiveStep(client, requisitionId);

    // Covers both "wrong approver" and "acting on a step that isn't
    // active yet" — a not-yet-active step never shows up here at all
    // (P2P-022 AC: out-of-turn actions are rejected server-side).
    if (!activeStep || activeStep.approverUserId !== actorId) {
      throw new ForbiddenException('This requisition is not currently awaiting your action');
    }

    const stepStatus =
      action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'CHANGES_REQUESTED';
    const before = { ...activeStep };

    const updatedStep = await client.approvalStep.update({
      where: { id: activeStep.id },
      data: { status: stepStatus, reason, actedAt: new Date() },
    });

    await this.audit.record(client, {
      entityType: 'ApprovalStep',
      entityId: activeStep.id,
      action,
      actorId,
      before,
      after: updatedStep,
    });

    if (action === 'reject') {
      await this.setRequisitionStatus(client, requisitionId, 'REJECTED');
    } else if (action === 'request_changes') {
      await this.setRequisitionStatus(client, requisitionId, 'CHANGES_REQUESTED');
    } else {
      const nextStep = await client.approvalStep.findFirst({
        where: { requisitionId, stepOrder: { gt: activeStep.stepOrder } },
        orderBy: { stepOrder: 'asc' },
      });

      if (nextStep) {
        await client.approvalStep.update({
          where: { id: nextStep.id },
          data: { becameActiveAt: new Date() },
        });
      } else {
        await this.setRequisitionStatus(client, requisitionId, 'APPROVED');
      }
    }

    return updatedStep;
  }

  private async setRequisitionStatus(
    client: ScopedPrismaClient,
    requisitionId: string,
    status: string,
  ) {
    await client.requisition.update({ where: { id: requisitionId }, data: { status } as never });
  }
}
