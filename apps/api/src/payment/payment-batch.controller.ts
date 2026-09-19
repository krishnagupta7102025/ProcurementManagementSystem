import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { OidcAuthGuard } from '../auth/oidc-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Role } from '../generated/prisma/enums.js';
import { CreatePaymentBatchDto } from './dto/create-payment-batch.dto.js';
import { ReleasePaymentBatchDto } from './dto/release-payment-batch.dto.js';
import { PaymentBatchService } from './payment-batch.service.js';

@UseGuards(OidcAuthGuard, RolesGuard)
@Controller('payment-batches')
export class PaymentBatchController {
  constructor(private readonly batches: PaymentBatchService) {}

  @Get('candidate-invoices')
  @Roles(Role.AP, Role.ADMIN)
  findApprovedInvoices(
    @CurrentUser() user: AuthenticatedUser,
    @Query('vendorId') vendorId?: string,
    @Query('dueBefore') dueBefore?: string,
    @Query('minAmount') minAmount?: string,
    @Query('maxAmount') maxAmount?: string,
    @Query('costCenterId') costCenterId?: string,
  ) {
    return this.batches.findApprovedInvoices(user.orgId, {
      vendorId,
      dueBefore,
      minAmount: minAmount ? Number(minAmount) : undefined,
      maxAmount: maxAmount ? Number(maxAmount) : undefined,
      costCenterId,
    });
  }

  @Post()
  @Roles(Role.AP, Role.ADMIN)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePaymentBatchDto) {
    return this.batches.create(user.orgId, user.localUserId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: string) {
    return this.batches.findAll(user.orgId, { status });
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.batches.findOne(user.orgId, id);
  }

  // Second-approver control (P2P-061) — only a Controller/Admin, never AP itself.
  @Post(':id/approve')
  @Roles(Role.CONTROLLER, Role.ADMIN)
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.batches.approve(user.orgId, user.localUserId, id);
  }

  @Post(':id/release')
  @Roles(Role.AP, Role.ADMIN)
  release(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReleasePaymentBatchDto,
  ) {
    return this.batches.release(user.orgId, user.localUserId, id, dto);
  }

  @Post(':id/cancel')
  @Roles(Role.AP, Role.ADMIN)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.batches.cancel(user.orgId, user.localUserId, id, reason);
  }
}
