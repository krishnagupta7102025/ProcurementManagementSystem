import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { OidcAuthGuard } from '../auth/oidc-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Role } from '../generated/prisma/enums.js';
import { AdjustAndRematchDto } from './dto/adjust-and-rematch.dto.js';
import { ManualOverrideDto } from './dto/manual-override.dto.js';
import { RequestCreditNoteDto } from './dto/request-credit-note.dto.js';
import { MatchExceptionService } from './match-exception.service.js';

@UseGuards(OidcAuthGuard, RolesGuard)
@Roles(Role.AP, Role.ADMIN)
@Controller('match-exceptions')
export class MatchExceptionController {
  constructor(private readonly exceptions: MatchExceptionService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: string) {
    return this.exceptions.findAll(user.orgId, { status });
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.exceptions.findOne(user.orgId, id);
  }

  @Post(':id/request-credit-note')
  requestCreditNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RequestCreditNoteDto,
  ) {
    return this.exceptions.requestCreditNote(user.orgId, user.localUserId, id, dto.notes);
  }

  @Post(':id/adjust-and-rematch')
  adjustAndRematch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AdjustAndRematchDto,
  ) {
    return this.exceptions.adjustAndRematch(user.orgId, user.localUserId, id, dto.lines);
  }

  // Manual override is escalated beyond ordinary AP action — requires
  // Admin, per docs/00-prd.md §4.6 ("escalate for manual approval override").
  @Post(':id/manual-override')
  @Roles(Role.ADMIN)
  manualOverride(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ManualOverrideDto,
  ) {
    return this.exceptions.manualOverride(user.orgId, user.localUserId, id, dto.reason);
  }
}
