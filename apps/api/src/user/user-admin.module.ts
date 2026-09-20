import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UserController } from './user.controller.js';
import { UserModule } from './user.module.js';

/** Hosts UserController — split from UserModule to avoid a circular import with AuthModule. */
@Module({
  imports: [AuthModule, UserModule],
  controllers: [UserController],
})
export class UserAdminModule {}
