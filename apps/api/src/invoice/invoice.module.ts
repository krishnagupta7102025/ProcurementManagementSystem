import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { InvoiceController } from './invoice.controller.js';
import { InvoiceService } from './invoice.service.js';
import { MatchExceptionController } from './match-exception.controller.js';
import { MatchExceptionService } from './match-exception.service.js';
import { MatchingService } from './matching.service.js';

@Module({
  imports: [AuditModule, AuthModule, StorageModule],
  controllers: [InvoiceController, MatchExceptionController],
  providers: [InvoiceService, MatchingService, MatchExceptionService],
  exports: [InvoiceService, MatchingService, MatchExceptionService],
})
export class InvoiceModule {}
