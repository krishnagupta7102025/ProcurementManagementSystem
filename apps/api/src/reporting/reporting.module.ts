import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GlExportController } from './gl-export.controller.js';
import { GlExportService } from './gl-export.service.js';
import { ReportingController } from './reporting.controller.js';
import { ReportingService } from './reporting.service.js';

@Module({
  imports: [AuthModule],
  controllers: [GlExportController, ReportingController],
  providers: [GlExportService, ReportingService],
})
export class ReportingModule {}
