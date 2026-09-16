import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { VendorController } from './vendor.controller.js';
import { VendorService } from './vendor.service.js';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [VendorController],
  providers: [VendorService],
  exports: [VendorService],
})
export class VendorModule {}
