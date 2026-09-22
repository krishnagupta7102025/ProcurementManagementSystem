import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { Role } from '../generated/prisma/enums.js';
import { CreateVendorDto } from './dto/create-vendor.dto.js';
import { UpdateVendorDto } from './dto/update-vendor.dto.js';
import { UpdateVendorStatusDto } from './dto/update-vendor-status.dto.js';
import { VendorService } from './vendor.service.js';

@UseGuards(AuthGuard, RolesGuard)
@Controller('vendors')
export class VendorController {
  constructor(private readonly vendors: VendorService) {}

  @Post()
  @Roles(Role.BUYER, Role.ADMIN)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVendorDto) {
    return this.vendors.create(user.orgId, user.localUserId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('activeOnly') activeOnly?: string) {
    return this.vendors.findAll(user.orgId, { activeOnly: activeOnly === 'true' });
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vendors.findOne(user.orgId, id);
  }

  @Get(':id/spend-summary')
  getSpendSummary(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vendors.getSpendSummary(user.orgId, id);
  }

  @Patch(':id')
  @Roles(Role.BUYER, Role.ADMIN)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendors.update(user.orgId, user.localUserId, id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.BUYER, Role.ADMIN)
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVendorStatusDto,
  ) {
    return this.vendors.updateStatus(user.orgId, user.localUserId, id, dto.status);
  }
}
