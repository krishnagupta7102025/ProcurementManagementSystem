import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BankStatementController } from './bank-statement.controller.js';
import { BankStatementService } from './bank-statement.service.js';
import { PaymentBatchController } from './payment-batch.controller.js';
import { PaymentBatchService } from './payment-batch.service.js';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [PaymentBatchController, BankStatementController],
  providers: [PaymentBatchService, BankStatementService],
  exports: [PaymentBatchService, BankStatementService],
})
export class PaymentModule {}
