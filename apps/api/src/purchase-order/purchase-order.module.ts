import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../email/email.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { PurchaseOrderController } from './purchase-order.controller.js';
import { PurchaseOrderService } from './purchase-order.service.js';

@Module({
  imports: [AuditModule, AuthModule, StorageModule, EmailModule],
  controllers: [PurchaseOrderController],
  providers: [PurchaseOrderService],
  exports: [PurchaseOrderService],
})
export class PurchaseOrderModule {}
