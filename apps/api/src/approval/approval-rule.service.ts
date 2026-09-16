import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import type { CreateApprovalRuleDto } from './dto/create-approval-rule.dto.js';
import type { UpdateApprovalRuleDto } from './dto/update-approval-rule.dto.js';

@Injectable()
export class ApprovalRuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(orgId: string, actorId: string, dto: CreateApprovalRuleDto) {
    const client = forOrg(this.prisma, orgId);
    const { steps, ...ruleFields } = dto;

    const rule = await client.approvalRule.create({ data: ruleFields as never });

    // Steps are created one at a time — see the note in VendorService about
    // nested writes bypassing the org-scoping extension's top-level hook.
    for (const step of steps) {
      await client.approvalRuleStep.create({
        data: {
          stepOrder: step.stepOrder,
          approverUserId: step.approverUserId,
          approvalRuleId: rule.id,
        } as never,
      });
    }

    await this.audit.record(client, {
      entityType: 'ApprovalRule',
      entityId: rule.id,
      action: 'create',
      actorId,
      after: rule,
    });

    return this.findOne(orgId, rule.id);
  }

  async findAll(orgId: string) {
    const client = forOrg(this.prisma, orgId);
    return client.approvalRule.findMany({
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const rule = await client.approvalRule.findUnique({
      where: { id },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!rule) {
      throw new NotFoundException(`Approval rule ${id} not found`);
    }
    return rule;
  }

  async update(orgId: string, actorId: string, id: string, dto: UpdateApprovalRuleDto) {
    const client = forOrg(this.prisma, orgId);
    const before = await this.findOne(orgId, id);
    const { steps, ...ruleFields } = dto;

    const rule = await client.approvalRule.update({ where: { id }, data: ruleFields });

    if (steps) {
      // Replace the step list wholesale — simpler and safer than diffing,
      // and cheap at Phase-0 volumes (a handful of steps per rule).
      await client.approvalRuleStep.deleteMany({ where: { approvalRuleId: id } });
      for (const step of steps) {
        await client.approvalRuleStep.create({
          data: {
            stepOrder: step.stepOrder,
            approverUserId: step.approverUserId,
            approvalRuleId: id,
          } as never,
        });
      }
    }

    await this.audit.record(client, {
      entityType: 'ApprovalRule',
      entityId: id,
      action: 'update',
      actorId,
      before,
      after: rule,
    });

    return this.findOne(orgId, id);
  }

  /**
   * Picks the single best-matching rule for a requisition's department,
   * cost center, and amount. Specificity: an exact department match scores
   * higher than a wildcard (null) department, same for cost center; the
   * highest combined score wins. A tie is broken by earliest-created rule
   * (deterministic, but arbitrary — an org with genuinely ambiguous
   * overlapping rules should tighten them, not rely on this order).
   */
  async resolveRule(
    orgId: string,
    params: { department: string; costCenterId: string; amountMinorUnits: number },
  ) {
    const client = forOrg(this.prisma, orgId);
    const candidates = await client.approvalRule.findMany({
      where: {
        OR: [{ department: params.department }, { department: null }],
        minAmountMinorUnits: { lte: params.amountMinorUnits },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });

    const matching = candidates.filter((rule) => {
      const costCenterMatches =
        rule.costCenterId === null || rule.costCenterId === params.costCenterId;
      const withinMax =
        rule.maxAmountMinorUnits === null || params.amountMinorUnits <= rule.maxAmountMinorUnits;
      return costCenterMatches && withinMax;
    });

    if (matching.length === 0) {
      return null;
    }

    const score = (rule: (typeof matching)[number]) =>
      (rule.department === params.department ? 2 : 1) +
      (rule.costCenterId === params.costCenterId ? 2 : 1);

    return matching.reduce((best, rule) => (score(rule) > score(best) ? rule : best), matching[0]);
  }
}
