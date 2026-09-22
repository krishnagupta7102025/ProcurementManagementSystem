import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';

// Global so every feature module can inject UserService without importing
// this module itself, matching PrismaModule's pattern.
@Global()
@Module({
  imports: [AuditModule, AuthModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
