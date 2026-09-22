import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Role } from '../generated/prisma/enums.js';
import { CostCenterService } from './cost-center.service.js';
import { CreateCostCenterDto } from './dto/create-cost-center.dto.js';

@UseGuards(AuthGuard, RolesGuard)
@Controller('cost-centers')
export class CostCenterController {
  constructor(private readonly costCenters: CostCenterService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCostCenterDto) {
    return this.costCenters.create(user.orgId, user.localUserId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('activeOnly') activeOnly?: string) {
    return this.costCenters.findAll(user.orgId, { activeOnly: activeOnly === 'true' });
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.costCenters.findOne(user.orgId, id);
  }
}
