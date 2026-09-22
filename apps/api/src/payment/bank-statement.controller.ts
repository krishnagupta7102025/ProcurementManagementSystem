import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Role } from '../generated/prisma/enums.js';
import { BankStatementService } from './bank-statement.service.js';
import { ImportBankStatementDto } from './dto/import-bank-statement.dto.js';
import { ReconcileBankStatementDto } from './dto/reconcile-bank-statement.dto.js';

@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.AP, Role.ADMIN)
@Controller('bank-statement-lines')
export class BankStatementController {
  constructor(private readonly bankStatements: BankStatementService) {}

  @Post('import')
  importCsv(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportBankStatementDto) {
    return this.bankStatements.importCsv(user.orgId, user.localUserId, dto.csv);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('unmatchedOnly') unmatchedOnly?: string) {
    return this.bankStatements.findAll(user.orgId, { unmatchedOnly: unmatchedOnly === 'true' });
  }

  @Post(':id/reconcile')
  reconcile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReconcileBankStatementDto,
  ) {
    return this.bankStatements.reconcile(user.orgId, user.localUserId, id, dto.paymentBatchId);
  }
}
