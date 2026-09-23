import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ApprovalRuleController } from './approval-rule.controller.js';
import { ApprovalRuleService } from './approval-rule.service.js';
import { ApprovalController } from './approval.controller.js';
import { ApprovalService } from './approval.service.js';
import { CronController } from './cron.controller.js';
import { EscalationService } from './escalation.service.js';

@Module({
  imports: [AuditModule, AuthModule, NotificationsModule],
  controllers: [ApprovalRuleController, ApprovalController, CronController],
  providers: [ApprovalRuleService, ApprovalService, EscalationService],
  exports: [ApprovalRuleService, ApprovalService, EscalationService],
})
export class ApprovalModule {}
