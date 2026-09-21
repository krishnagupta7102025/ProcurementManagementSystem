import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { OidcAuthGuard } from '../auth/oidc-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CreateRequisitionDto } from './dto/create-requisition.dto.js';
import { UpdateRequisitionDto } from './dto/update-requisition.dto.js';
import { UploadAttachmentDto } from './dto/upload-attachment.dto.js';
import { RequisitionService } from './requisition.service.js';

@UseGuards(OidcAuthGuard)
@Controller('requisitions')
export class RequisitionController {
  constructor(private readonly requisitions: RequisitionService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRequisitionDto) {
    return this.requisitions.create(user.orgId, user.localUserId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('mine') mine?: string,
  ) {
    return this.requisitions.findAll(user.orgId, {
      status,
      requesterId: mine === 'true' ? user.localUserId : undefined,
    });
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requisitions.findOne(user.orgId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRequisitionDto,
  ) {
    return this.requisitions.update(user.orgId, user.localUserId, id, dto);
  }

  @Post(':id/submit')
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requisitions.submit(user.orgId, user.localUserId, id);
  }

  @Post(':id/withdraw')
  withdraw(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requisitions.withdraw(user.orgId, user.localUserId, id);
  }

  @Post(':id/clone')
  clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requisitions.clone(user.orgId, user.localUserId, id);
  }

  @Post(':id/attachments')
  addAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UploadAttachmentDto,
  ) {
    return this.requisitions.addAttachment(user.orgId, user.localUserId, id, dto);
  }

  @Get(':id/attachments/:attachmentId/download')
  getAttachmentDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.requisitions.getAttachmentDownloadUrl(user.orgId, id, attachmentId);
  }
}
