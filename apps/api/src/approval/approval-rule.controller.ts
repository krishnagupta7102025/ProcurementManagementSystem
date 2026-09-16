import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { OidcAuthGuard } from '../auth/oidc-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Role } from '../generated/prisma/enums.js';
import { ApprovalRuleService } from './approval-rule.service.js';
import { CreateApprovalRuleDto } from './dto/create-approval-rule.dto.js';
import { UpdateApprovalRuleDto } from './dto/update-approval-rule.dto.js';

@UseGuards(OidcAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('approval-rules')
export class ApprovalRuleController {
  constructor(private readonly rules: ApprovalRuleService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateApprovalRuleDto) {
    return this.rules.create(user.orgId, user.localUserId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.rules.findAll(user.orgId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rules.findOne(user.orgId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateApprovalRuleDto,
  ) {
    return this.rules.update(user.orgId, user.localUserId, id, dto);
  }
}
