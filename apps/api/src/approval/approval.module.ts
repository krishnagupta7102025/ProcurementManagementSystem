import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ApprovalRuleController } from './approval-rule.controller.js';
import { ApprovalRuleService } from './approval-rule.service.js';
import { ApprovalController } from './approval.controller.js';
import { ApprovalService } from './approval.service.js';
import { ESCALATION_QUEUE, EscalationProcessor } from './escalation.processor.js';
import { EscalationScheduler } from './escalation.scheduler.js';
import { EscalationService } from './escalation.service.js';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    NotificationsModule,
    BullModule.registerQueue({ name: ESCALATION_QUEUE }),
  ],
  controllers: [ApprovalRuleController, ApprovalController],
  providers: [
    ApprovalRuleService,
    ApprovalService,
    EscalationService,
    EscalationProcessor,
    EscalationScheduler,
  ],
  exports: [ApprovalRuleService, ApprovalService, EscalationService],
})
export class ApprovalModule {}
