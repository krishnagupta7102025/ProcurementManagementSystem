import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import type { VendorStatus } from '../generated/prisma/enums.js';
import type { CreateVendorDto } from './dto/create-vendor.dto.js';
import type { UpdateVendorDto } from './dto/update-vendor.dto.js';

export interface VendorSpendSummary {
  vendorId: string;
  totalCommittedMinorUnits: number;
  totalPaidMinorUnits: number;
  avgInvoiceToPaymentDays: number | null;
}

@Injectable()
export class VendorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(orgId: string, actorId: string, dto: CreateVendorDto) {
    const client = forOrg(this.prisma, orgId);
    const { contacts, ...vendorFields } = dto;

    const vendor = await client.vendor.create({ data: vendorFields as never });

    // Contacts are created one at a time rather than as a nested write —
    // the org-scoping extension only intercepts top-level operations, so a
    // nested `contacts: { create: [...] }` would bypass its orgId injection.
    for (const contact of contacts ?? []) {
      await client.vendorContact.create({
        data: {
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          vendorId: vendor.id,
        } as never,
      });
    }

    await this.audit.record(client, {
      entityType: 'Vendor',
      entityId: vendor.id,
      action: 'create',
      actorId,
      after: vendor,
    });

    return this.findOne(orgId, vendor.id);
  }

  async findAll(orgId: string, opts: { activeOnly?: boolean } = {}) {
    const client = forOrg(this.prisma, orgId);
    return client.vendor.findMany({
      where: opts.activeOnly ? { status: 'ACTIVE' } : undefined,
      include: { contacts: true },
      orderBy: { legalName: 'asc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const client = forOrg(this.prisma, orgId);
    const vendor = await client.vendor.findUnique({ where: { id }, include: { contacts: true } });
    if (!vendor) {
      throw new NotFoundException(`Vendor ${id} not found`);
    }
    return vendor;
  }

  async update(orgId: string, actorId: string, id: string, dto: UpdateVendorDto) {
    const client = forOrg(this.prisma, orgId);
    const before = await this.findOne(orgId, id);

    const { contacts: _contacts, ...vendorFields } = dto;
    const vendor = await client.vendor.update({ where: { id }, data: vendorFields });

    await this.audit.record(client, {
      entityType: 'Vendor',
      entityId: id,
      action: 'update',
      actorId,
      before,
      after: vendor,
    });

    return this.findOne(orgId, id);
  }

  async updateStatus(orgId: string, actorId: string, id: string, status: VendorStatus) {
    const client = forOrg(this.prisma, orgId);
    const before = await this.findOne(orgId, id);

    const vendor = await client.vendor.update({ where: { id }, data: { status } });

    await this.audit.record(client, {
      entityType: 'Vendor',
      entityId: id,
      action: 'status_change',
      actorId,
      before: { status: before.status },
      after: { status: vendor.status },
    });

    return this.findOne(orgId, id);
  }

  /**
   * Total committed/paid spend and average invoice-to-payment days.
   *
   * PurchaseOrder and Invoice don't exist yet (they land in Epic D and
   * Epic F) — this returns zeros/null rather than fabricate numbers, so the
   * endpoint shape is stable for the frontend now and the real aggregate
   * query can replace this body without an API change once those tables
   * exist. See docs/10-phase-0-tickets.md P2P-011.
   */
  async getSpendSummary(orgId: string, id: string): Promise<VendorSpendSummary> {
    await this.findOne(orgId, id);
    return {
      vendorId: id,
      totalCommittedMinorUnits: 0,
      totalPaidMinorUnits: 0,
      avgInvoiceToPaymentDays: null,
    };
  }
}
