import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Role } from '../generated/prisma/enums.js';
import { ReportingService } from './reporting.service.js';

@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.AP, Role.CONTROLLER, Role.ADMIN)
@Controller('reports')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('open-po-commitment')
  openPoCommitment(@CurrentUser() user: AuthenticatedUser) {
    return this.reporting.openPoCommitment(user.orgId);
  }

  @Get('ap-aging')
  apAging(@CurrentUser() user: AuthenticatedUser) {
    return this.reporting.apAging(user.orgId);
  }

  @Get('invoice-to-payment-cycle-time')
  invoiceToPaymentCycleTime(@CurrentUser() user: AuthenticatedUser) {
    return this.reporting.invoiceToPaymentCycleTime(user.orgId);
  }

  @Get('requisition-sla-compliance')
  requisitionSlaCompliance(@CurrentUser() user: AuthenticatedUser) {
    return this.reporting.requisitionSlaCompliance(user.orgId);
  }
}
