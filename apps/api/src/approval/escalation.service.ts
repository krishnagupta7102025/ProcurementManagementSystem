import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  NOTIFICATION_SERVICE,
  type NotificationService,
} from '../notifications/notification.interface.js';

const REMINDER_AFTER_MS = Number(process.env.APPROVAL_SLA_REMINDER_HOURS ?? 48) * 60 * 60 * 1000;
const ESCALATE_AFTER_MS = Number(process.env.APPROVAL_SLA_ESCALATE_HOURS ?? 96) * 60 * 60 * 1000;

/**
 * SLA escalation (P2P-023). Scans every active (becameActiveAt set, still
 * PENDING) approval step across all orgs — a background job, unlike
 * request-scoped services, so it reads across tenants directly and only
 * uses the org-scoped client for the actual writes/audit per step.
 *
 * Idempotent by construction: reminderSentAt/escalatedAt are set exactly
 * once and checked before acting again, so re-running (or running twice
 * concurrently on the same step) never double-notifies (P2P-023 AC).
 */
@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_SERVICE) private readonly notifications: NotificationService,
  ) {}

  async runOnce(): Promise<{ remindersSent: number; escalationsSent: number }> {
    const now = Date.now();
    const activeSteps = await this.prisma.approvalStep.findMany({
      where: { status: 'PENDING', becameActiveAt: { not: null } },
      include: { approver: true, requisition: true },
    });

    let remindersSent = 0;
    let escalationsSent = 0;

    for (const step of activeSteps) {
      const ageMs = now - step.becameActiveAt!.getTime();
      const client = forOrg(this.prisma, step.orgId);

      if (ageMs >= ESCALATE_AFTER_MS && !step.escalatedAt) {
        if (step.approver.managerId) {
          await this.notifications.send({
            orgId: step.orgId,
            recipientUserId: step.approver.managerId,
            type: 'approval_escalated',
            title: `Approval overdue: ${step.requisition.id}`,
            body: `${step.approver.displayName} has not acted on requisition ${step.requisition.id} within the SLA window.`,
          });
        } else {
          this.logger.warn(
            `Approval step ${step.id} breached escalation SLA but approver ${step.approverUserId} has no manager configured — nothing to escalate to.`,
          );
        }

        await client.approvalStep.update({
          where: { id: step.id },
          data: { escalatedAt: new Date() },
        });
        await this.audit.record(client, {
          entityType: 'ApprovalStep',
          entityId: step.id,
          action: 'escalate',
          actorId: 'system:escalation-job',
        });
        escalationsSent += 1;
        continue;
      }

      if (ageMs >= REMINDER_AFTER_MS && !step.reminderSentAt) {
        await this.notifications.send({
          orgId: step.orgId,
          recipientUserId: step.approverUserId,
          type: 'approval_reminder',
          title: `Reminder: requisition ${step.requisition.id} awaiting your approval`,
          body: `This has been pending your action for over ${REMINDER_AFTER_MS / (60 * 60 * 1000)} hours.`,
        });

        await client.approvalStep.update({
          where: { id: step.id },
          data: { reminderSentAt: new Date() },
        });
        await this.audit.record(client, {
          entityType: 'ApprovalStep',
          entityId: step.id,
          action: 'remind',
          actorId: 'system:escalation-job',
        });
        remindersSent += 1;
      }
    }

    return { remindersSent, escalationsSent };
  }
}
