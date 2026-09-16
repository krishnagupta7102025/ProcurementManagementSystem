import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from './prisma.service.js';
import { forOrg } from './scoped-prisma.js';

describe('org scoping (P2P-002)', () => {
  const prisma = new PrismaService();
  let orgA: { id: string };
  let orgB: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
    orgA = await prisma.org.create({ data: { name: 'Org A' } });
    orgB = await prisma.org.create({ data: { name: 'Org B' } });
  });

  afterAll(async () => {
    await prisma.costCenter.deleteMany({ where: { orgId: { in: [orgA.id, orgB.id] } } });
    await prisma.org.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    await prisma.$disconnect();
  });

  it('a cross-org query returns nothing, even for a valid record id', async () => {
    const scopedAsA = forOrg(prisma, orgA.id);
    const scopedAsB = forOrg(prisma, orgB.id);

    const created = await scopedAsA.costCenter.create({
      data: { code: 'CC-1', name: 'Marketing', department: 'Marketing' } as never,
    });
    expect(created.orgId).toBe(orgA.id);

    const foundByOwner = await scopedAsA.costCenter.findUnique({ where: { id: created.id } });
    expect(foundByOwner?.id).toBe(created.id);

    const foundByOtherOrg = await scopedAsB.costCenter.findUnique({ where: { id: created.id } });
    expect(foundByOtherOrg).toBeNull();

    const listByOtherOrg = await scopedAsB.costCenter.findMany();
    expect(listByOtherOrg).toHaveLength(0);
  });

  it('cannot override the enforced orgId by passing a different one in `where`', async () => {
    const scopedAsA = forOrg(prisma, orgA.id);
    const scopedAsB = forOrg(prisma, orgB.id);

    const created = await scopedAsA.costCenter.create({
      data: { code: 'CC-2', name: 'Ops', department: 'Ops' } as never,
    });

    // A client scoped to org B, even if it tries to smuggle org A's id into
    // `where`, must still be forced back onto org B's own data.
    const result = await scopedAsB.costCenter.findFirst({
      where: { id: created.id, orgId: orgA.id },
    });
    expect(result).toBeNull();
  });

  it('cannot create a record under another org by passing orgId in `data`', async () => {
    const scopedAsB = forOrg(prisma, orgB.id);

    const created = await scopedAsB.costCenter.create({
      data: { code: 'CC-3', name: 'Smuggled', department: 'Ops', orgId: orgA.id } as never,
    });

    expect(created.orgId).toBe(orgB.id);
  });
});
