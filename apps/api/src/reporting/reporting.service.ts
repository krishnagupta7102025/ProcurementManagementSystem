import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';

const OPEN_PO_STATUSES = [
  'ISSUED',
  'PENDING_APPROVAL',
  'PARTIALLY_RECEIVED',
  'FULLY_RECEIVED',
] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Total value still outstanding against active purchase orders (P2P-071). */
  async openPoCommitment(orgId: string) {
    const client = forOrg(this.prisma, orgId);
    const openPos = await client.purchaseOrder.findMany({
      where: { status: { in: [...OPEN_PO_STATUSES] } },
      include: { vendor: true },
    });

    const byVendor = new Map<
      string,
      { vendorId: string; vendorName: string; totalMinorUnits: number }
    >();
    for (const po of openPos) {
      const entry = byVendor.get(po.vendorId) ?? {
        vendorId: po.vendorId,
        vendorName: po.vendor.legalName,
        totalMinorUnits: 0,
      };
      entry.totalMinorUnits += po.negotiatedTotalMinorUnits;
      byVendor.set(po.vendorId, entry);
    }

    return {
      totalMinorUnits: openPos.reduce((sum, po) => sum + po.negotiatedTotalMinorUnits, 0),
      poCount: openPos.length,
      byVendor: [...byVendor.values()],
    };
  }

  /** Outstanding APPROVED_FOR_PAYMENT balance bucketed by days past due (P2P-071). */
  async apAging(orgId: string) {
    const client = forOrg(this.prisma, orgId);
    const invoices = await client.invoice.findMany({ where: { status: 'APPROVED_FOR_PAYMENT' } });

    const buckets = { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, days90Plus: 0 };
    const now = Date.now();

    for (const invoice of invoices) {
      const outstanding = invoice.totalMinorUnits - invoice.paidAmountMinorUnits;
      const daysOverdue = invoice.dueDate
        ? Math.floor((now - invoice.dueDate.getTime()) / DAY_MS)
        : -1;

      if (daysOverdue <= 0) buckets.current += outstanding;
      else if (daysOverdue <= 30) buckets.days1To30 += outstanding;
      else if (daysOverdue <= 60) buckets.days31To60 += outstanding;
      else if (daysOverdue <= 90) buckets.days61To90 += outstanding;
      else buckets.days90Plus += outstanding;
    }

    return buckets;
  }

  /** Median/average days from invoice submission to the payment that fully paid it (P2P-071). */
  async invoiceToPaymentCycleTime(orgId: string) {
    const client = forOrg(this.prisma, orgId);
    const paidInvoices = await client.invoice.findMany({
      where: { status: 'PAID', submittedAt: { not: null } },
      include: {
        paymentBatchLines: { include: { paymentBatch: true } },
      },
    });

    const cycleDays: number[] = [];
    for (const invoice of paidInvoices) {
      if (!invoice.submittedAt) continue;
      const releaseDates = invoice.paymentBatchLines
        .filter((l) => l.paymentBatch.status === 'RELEASED' && l.paymentBatch.paymentDate)
        .map((l) => l.paymentBatch.paymentDate!.getTime());
      if (releaseDates.length === 0) continue;

      const paidAt = Math.max(...releaseDates);
      cycleDays.push((paidAt - invoice.submittedAt.getTime()) / DAY_MS);
    }

    return {
      invoiceCount: cycleDays.length,
      averageDays:
        cycleDays.length > 0 ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : null,
      medianDays: median(cycleDays),
    };
  }

  /** % of submitted requisitions whose approval chain never breached the escalation SLA (P2P-071). */
  async requisitionSlaCompliance(orgId: string) {
    const client = forOrg(this.prisma, orgId);
    const requisitions = await client.requisition.findMany({
      where: { status: { not: 'DRAFT' } },
      include: { approvalSteps: true },
    });

    const total = requisitions.length;
    const escalated = requisitions.filter((r) =>
      r.approvalSteps.some((s) => s.escalatedAt !== null),
    ).length;

    return {
      totalSubmitted: total,
      escalatedCount: escalated,
      compliantCount: total - escalated,
      complianceRate: total > 0 ? (total - escalated) / total : null,
    };
  }
}
