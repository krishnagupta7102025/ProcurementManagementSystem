import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { OidcAuthGuard } from '../auth/oidc-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Role } from '../generated/prisma/enums.js';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { SendToVendorDto } from './dto/send-to-vendor.dto.js';
import { PurchaseOrderService } from './purchase-order.service.js';

@UseGuards(OidcAuthGuard, RolesGuard)
@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly purchaseOrders: PurchaseOrderService) {}

  @Post()
  @Roles(Role.BUYER, Role.ADMIN)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrders.create(user.orgId, user.localUserId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('vendorId') vendorId?: string,
  ) {
    return this.purchaseOrders.findAll(user.orgId, { status, vendorId });
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.purchaseOrders.findOne(user.orgId, id);
  }

  @Post(':id/issue')
  @Roles(Role.BUYER, Role.ADMIN)
  issue(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.purchaseOrders.issue(user.orgId, user.localUserId, id);
  }

  @Post(':id/approve-variance')
  @Roles(Role.CONTROLLER, Role.ADMIN)
  approveVariance(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.purchaseOrders.approveVariance(user.orgId, user.localUserId, id);
  }

  @Post(':id/cancel')
  @Roles(Role.BUYER, Role.ADMIN)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.purchaseOrders.cancel(user.orgId, user.localUserId, id, reason);
  }

  @Post(':id/pdf')
  @Roles(Role.BUYER, Role.ADMIN)
  getPdfDownloadUrl(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.purchaseOrders.getPdfDownloadUrl(user.orgId, id);
  }

  @Post(':id/send-to-vendor')
  @Roles(Role.BUYER, Role.ADMIN)
  sendToVendor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendToVendorDto,
  ) {
    return this.purchaseOrders.sendToVendor(user.orgId, user.localUserId, id, dto.message);
  }
}
