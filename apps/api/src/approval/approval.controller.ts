import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApprovalService } from './approval.service.js';
import { ApprovalActionDto } from './dto/approval-action.dto.js';

@UseGuards(AuthGuard)
@Controller('approvals')
export class ApprovalController {
  constructor(private readonly approvals: ApprovalService) {}

  @Get('pending')
  findMyPending(@CurrentUser() user: AuthenticatedUser) {
    return this.approvals.findMyPending(user.orgId, user.localUserId);
  }

  @Post('requisitions/:id/approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvals.act(user.orgId, user.localUserId, id, 'approve', dto.reason);
  }

  @Post('requisitions/:id/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvals.act(user.orgId, user.localUserId, id, 'reject', dto.reason);
  }

  @Post('requisitions/:id/request-changes')
  requestChanges(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvals.act(user.orgId, user.localUserId, id, 'request_changes', dto.reason);
  }
}
