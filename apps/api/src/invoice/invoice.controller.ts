import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { OidcAuthGuard } from '../auth/oidc-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Role } from '../generated/prisma/enums.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { UpdateInvoiceDto } from './dto/update-invoice.dto.js';
import { InvoiceService } from './invoice.service.js';

@UseGuards(OidcAuthGuard, RolesGuard)
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get('check-duplicate')
  @Roles(Role.AP, Role.ADMIN)
  checkDuplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Query('vendorId') vendorId: string,
    @Query('invoiceNumber') invoiceNumber: string,
    @Query('totalMinorUnits') totalMinorUnits: string,
  ) {
    return this.invoices.checkDuplicate(
      user.orgId,
      vendorId,
      invoiceNumber,
      Number(totalMinorUnits),
    );
  }

  @Post()
  @Roles(Role.AP, Role.ADMIN)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInvoiceDto) {
    return this.invoices.create(user.orgId, user.localUserId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('vendorId') vendorId?: string,
  ) {
    return this.invoices.findAll(user.orgId, { status, vendorId });
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoices.findOne(user.orgId, id);
  }

  @Patch(':id')
  @Roles(Role.AP, Role.ADMIN)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoices.update(user.orgId, user.localUserId, id, dto);
  }

  @Post(':id/submit')
  @Roles(Role.AP, Role.ADMIN)
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoices.submit(user.orgId, user.localUserId, id);
  }

  @Post(':id/approve')
  @Roles(Role.AP, Role.ADMIN)
  approveMatched(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoices.approveMatched(user.orgId, user.localUserId, id);
  }

  @Post(':id/void')
  @Roles(Role.AP, Role.ADMIN)
  void_(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.invoices.void(user.orgId, user.localUserId, id, reason);
  }
}
