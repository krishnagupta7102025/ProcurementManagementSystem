import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role } from '../generated/prisma/enums.js';
import { cleanupOrg, createTestOrg, createTestUser } from '../test-utils/seed-helpers.js';
import { UserService } from './user.service.js';

describe('UserService', () => {
  const prisma = new PrismaService();
  const service = new UserService(prisma, new AuditService());

  let org: { id: string };
  let admin: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    org = await createTestOrg(prisma);
    admin = await createTestUser(prisma, org.id, [Role.ADMIN]);
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  it('creates a user scoped to the org with the given roles', async () => {
    const user = await service.create(org.id, admin.id, {
      email: 'new.buyer@example.test',
      displayName: 'New Buyer',
      roles: [Role.BUYER],
    });
    expect(user.email).toBe('new.buyer@example.test');
    expect(user.roles).toEqual([Role.BUYER]);

    const all = await service.findAll(org.id);
    expect(all.map((u) => u.id)).toContain(user.id);
  });

  it('rejects creating a second user with the same email', async () => {
    await service.create(org.id, admin.id, {
      email: 'dup@example.test',
      displayName: 'First',
      roles: [Role.REQUESTER],
    });
    await expect(
      service.create(org.id, admin.id, {
        email: 'dup@example.test',
        displayName: 'Second',
        roles: [Role.REQUESTER],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
