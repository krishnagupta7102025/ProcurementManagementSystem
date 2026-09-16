import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RequisitionController } from './requisition.controller.js';
import { RequisitionService } from './requisition.service.js';

@Module({
  imports: [AuditModule, AuthModule, ApprovalModule],
  controllers: [RequisitionController],
  providers: [RequisitionService],
  exports: [RequisitionService],
})
export class RequisitionModule {}
