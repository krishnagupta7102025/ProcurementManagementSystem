import { Global, Module } from '@nestjs/common';
import { UserService } from './user.service.js';

// Global (like PrismaModule): OidcAuthGuard depends on UserService, and
// @UseGuards(OidcAuthGuard) constructs the guard fresh within each
// consuming module's own DI scope — without this being global, every
// module using the guard would need to re-import UserModule itself.
@Global()
@Module({
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
