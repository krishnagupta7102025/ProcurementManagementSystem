import { UnauthorizedException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { cleanupOrg, createTestOrg, createTestUser } from '../test-utils/seed-helpers.js';
import { AuthService } from './auth.service.js';
import { verifySessionToken } from './jwt.util.js';

describe('AuthService', () => {
  const prisma = new PrismaService();
  const service = new AuthService(prisma);

  let org: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    process.env.AUTH_JWT_SECRET ??= 'test-secret-value-not-used-anywhere-real';
    org = await createTestOrg(prisma);
  });

  afterAll(async () => {
    await cleanupOrg(prisma, org.id);
    await prisma.$disconnect();
  });

  it('logs in with the correct password and returns a session token carrying the right claims', async () => {
    const user = await createTestUser(prisma, org.id, ['ADMIN'], 'correct-horse-battery-staple');

    const { token, user: returned } = await service.login({ email: user.email, password: 'correct-horse-battery-staple' });
    expect(returned.id).toBe(user.id);
    expect(returned.roles).toEqual(['ADMIN']);

    const claims = await verifySessionToken(token);
    expect(claims.sub).toBe(user.id);
    expect(claims.orgId).toBe(org.id);
  });

  it('rejects a wrong password with the same generic error as an unknown email', async () => {
    const user = await createTestUser(prisma, org.id, ['ADMIN'], 'correct-horse-battery-staple');

    await expect(service.login({ email: user.email, password: 'wrong-password' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      service.login({ email: 'nobody-at-all@demo.p2p', password: 'anything' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
