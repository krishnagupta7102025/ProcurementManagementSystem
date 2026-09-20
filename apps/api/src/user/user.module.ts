import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { UserService } from './user.service.js';

// Global (like PrismaModule): OidcAuthGuard depends on UserService, and
// @UseGuards(OidcAuthGuard) constructs the guard fresh within each
// consuming module's own DI scope — without this being global, every
// module using the guard would need to re-import UserModule itself.
//
// No controller here on purpose: AuthModule imports UserModule (for
// OidcAuthGuard's UserService dependency), so UserModule importing
// AuthModule back — which UserController's own @UseGuards(OidcAuthGuard)
// would require — would be circular. UserController lives in
// UserAdminModule instead, which can safely import both.
@Global()
@Module({
  imports: [AuditModule],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
