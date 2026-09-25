import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LoginDto } from './dto/login.dto.js';
import { signSessionToken } from './jwt.util.js';
import { verifyPassword } from './password.util.js';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Email is globally unique (not org-scoped) precisely so login can look a
   * user up before there's any "current org" to scope by — the only place
   * in this app that queries User without going through forOrg().
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Same generic error whether the email doesn't exist or the password is
    // wrong — never reveal which one it was.
    const invalidCredentials = () => new UnauthorizedException('Invalid email or password');

    if (!user) {
      throw invalidCredentials();
    }
    const valid = await verifyPassword(dto.password, user.passwordHash);
    if (!valid) {
      throw invalidCredentials();
    }

    const token = await signSessionToken({
      sub: user.id,
      orgId: user.orgId,
      email: user.email,
      displayName: user.displayName,
      // roles is a Json column (see schema.prisma) storing a Role[] array —
      // cast back at this boundary rather than loosening SessionClaims.
      roles: user.roles as Role[],
    });

    return {
      token,
      user: {
        id: user.id,
        orgId: user.orgId,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
      },
    };
  }
}
