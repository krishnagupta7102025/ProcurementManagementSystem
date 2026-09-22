import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Role } from '../generated/prisma/enums.js';
import { GlExportService } from './gl-export.service.js';

@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.AP, Role.ADMIN)
@Controller('reports/gl-export')
export class GlExportController {
  constructor(private readonly glExport: GlExportService) {}

  @Get()
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="gl-export.csv"')
  export(@CurrentUser() user: AuthenticatedUser) {
    return this.glExport.exportCsv(user.orgId);
  }
}
