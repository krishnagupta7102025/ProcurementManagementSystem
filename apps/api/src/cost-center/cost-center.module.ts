import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CostCenterController } from './cost-center.controller.js';
import { CostCenterService } from './cost-center.service.js';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [CostCenterController],
  providers: [CostCenterService],
  exports: [CostCenterService],
})
export class CostCenterModule {}
