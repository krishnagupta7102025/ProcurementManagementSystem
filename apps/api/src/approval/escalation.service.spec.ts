import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import type {
  NotificationPayload,
  NotificationService,
} from '../notifications/notification.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import {
  cleanupOrg,
  createTestCostCenter,
  createTestOrg,
  createTestUser,
} from '../test-utils/seed-helpers.js';
import { EscalationService } from './escalation.service.js';

class RecordingNotificationService implements NotificationService {
  sent: NotificationPayload[] = [];
  async send(payload: NotificationPayload): Promise<void> {
    this.sent.push(payload);
  }
}

const HOUR = 60 * 60 * 1000;

describe('EscalationService (P2P-023)', () => {
  const prisma = new PrismaService();
  const audit = new AuditService();

  let org: { id: string };
  let manager: { id: string };
  let approver: { id: string };
  let requester: { id: string };
  let costCenter: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await createTestOrg(prisma);
    manager = await createTestUser(prisma, org.id, ['APPROVER']);
    approver = await createTestUser(prisma, org.id, ['APPROVER']);
    await prisma.user.update({ where: { id: approver.id }, data: { managerId: manager.id } });
    requester = await createTestUser(prisma, org.id, ['REQUESTER']);
    costCenter = await createTestCostCenter(prisma, org.id, 'Ops');
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  async function createActiveStep(becameActiveHoursAgo: number) {
    const client = forOrg(prisma, org.id);
    const req = await client.requisition.create({
      data: {
        requesterId: requester.id,
        costCenterId: costCenter.id,
        department: 'Ops',
        estimatedTotalMinorUnits: 1000,
        status: 'SUBMITTED',
      } as never,
    });
    const step = await client.approvalStep.create({
      data: {
        requisitionId: req.id,
        stepOrder: 1,
        approverUserId: approver.id,
        becameActiveAt: new Date(Date.now() - becameActiveHoursAgo * HOUR),
      } as never,
    });
    return step;
  }

  it('sends exactly one reminder for a step past the reminder threshold, even if the job runs twice (P2P-023 AC)', async () => {
    const step = await createActiveStep(50); // > 48h default, < 96h default
    const notifications = new RecordingNotificationService();
    const escalation = new EscalationService(prisma, audit, notifications);

    await escalation.runOnce();
    await escalation.runOnce();

    const reminders = notifications.sent.filter(
      (n) => n.type === 'approval_reminder' && n.recipientUserId === approver.id,
    );
    expect(reminders).toHaveLength(1);

    const client = forOrg(prisma, org.id);
    const updated = await client.approvalStep.findUnique({ where: { id: step.id } });
    expect(updated?.reminderSentAt).not.toBeNull();
    expect(updated?.escalatedAt).toBeNull();
  });

  it('escalates to the approver’s manager exactly once past the escalation threshold', async () => {
    await createActiveStep(100); // > 96h default
    const notifications = new RecordingNotificationService();
    const escalation = new EscalationService(prisma, audit, notifications);

    await escalation.runOnce();
    await escalation.runOnce();

    const escalations = notifications.sent.filter(
      (n) => n.type === 'approval_escalated' && n.recipientUserId === manager.id,
    );
    expect(escalations).toHaveLength(1);
  });

  it('does nothing for a step still within the reminder window', async () => {
    await createActiveStep(1);
    const notifications = new RecordingNotificationService();
    const escalation = new EscalationService(prisma, audit, notifications);

    const result = await escalation.runOnce();

    const forThisApprover = notifications.sent.filter((n) => n.recipientUserId === approver.id);
    expect(forThisApprover).toHaveLength(0);
    expect(result.remindersSent + result.escalationsSent).toBeGreaterThanOrEqual(0);
  });
});
