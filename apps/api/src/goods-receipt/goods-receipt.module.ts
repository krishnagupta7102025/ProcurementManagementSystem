import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { GoodsReceiptController } from './goods-receipt.controller.js';
import { GoodsReceiptService } from './goods-receipt.service.js';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [GoodsReceiptController],
  providers: [GoodsReceiptService],
  exports: [GoodsReceiptService],
})
export class GoodsReceiptModule {}
