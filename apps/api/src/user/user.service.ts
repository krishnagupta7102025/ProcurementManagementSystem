import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword } from '../auth/password.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import type { CreateUserDto } from './dto/create-user.dto.js';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(orgId: string) {
    const client = forOrg(this.prisma, orgId);
    return client.user.findMany({
      omit: { passwordHash: true },
      orderBy: { displayName: 'asc' },
    });
  }

  /** Admin-only (see UserController) — sets the user's initial password directly, since there's no email-invite flow in Phase 0. */
  async create(orgId: string, actorId: string, dto: CreateUserDto) {
    const client = forOrg(this.prisma, orgId);
    const existing = await client.user.findFirst({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException(`A user with email "${dto.email}" already exists in this org`);
    }

    const passwordHash = await hashPassword(dto.password);
    const user = await client.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        roles: dto.roles,
        managerId: dto.managerId,
      } as never,
      omit: { passwordHash: true },
    });

    await this.audit.record(client, {
      entityType: 'User',
      entityId: user.id,
      action: 'create',
      actorId,
      after: user,
    });

    return user;
  }
}
