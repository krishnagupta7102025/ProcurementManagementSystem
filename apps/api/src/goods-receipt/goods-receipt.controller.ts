import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { OidcAuthGuard } from '../auth/oidc-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Role } from '../generated/prisma/enums.js';
import { ConfirmServiceDto } from './dto/confirm-service.dto.js';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto.js';
import { GoodsReceiptService } from './goods-receipt.service.js';

@UseGuards(OidcAuthGuard, RolesGuard)
@Controller('purchase-orders/:poId/goods-receipts')
export class GoodsReceiptController {
  constructor(private readonly goodsReceipts: GoodsReceiptService) {}

  @Post()
  @Roles(Role.RECEIVER, Role.BUYER, Role.ADMIN)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('poId') poId: string,
    @Body() dto: CreateGoodsReceiptDto,
  ) {
    return this.goodsReceipts.recordGrn(user.orgId, user.localUserId, user.roles, poId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Param('poId') poId: string) {
    return this.goodsReceipts.findAllForPo(user.orgId, poId);
  }

  // A designated approver role confirms a service line was delivered
  // (P2P-041) — distinct from the RECEIVER role that handles physical GRNs.
  @Post('service-confirmations')
  @Roles(Role.APPROVER, Role.ADMIN)
  confirmService(
    @CurrentUser() user: AuthenticatedUser,
    @Param('poId') poId: string,
    @Body() dto: ConfirmServiceDto,
  ) {
    return this.goodsReceipts.confirmService(
      user.orgId,
      user.localUserId,
      poId,
      dto.poLineId,
      dto.notes,
    );
  }
}
