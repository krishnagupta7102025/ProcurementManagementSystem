import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { OidcAuthGuard } from './oidc-auth.guard.js';
import { OidcJwksService } from './oidc-jwks.service.js';

@Module({
  providers: [OidcJwksService, OidcAuthGuard, RolesGuard],
  exports: [OidcJwksService, OidcAuthGuard, RolesGuard],
})
export class AuthModule {}
