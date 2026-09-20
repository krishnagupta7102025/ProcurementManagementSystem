import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';
import { toCsv } from './csv.util.js';

const CSV_HEADER = [
  'invoiceId',
  'invoiceNumber',
  'vendorName',
  'vendorGstin',
  'costCenterCodes',
  'currency',
  'subtotalMinorUnits',
  'taxMinorUnits',
  'totalMinorUnits',
  'status',
  'invoiceDate',
];

/**
 * P2P-070: a generic CSV of postable entries for approved-for-payment and
 * paid invoices. There's no chart-of-accounts / GL account concept in this
 * schema yet — which accounting system Losung360 standardizes on is an
 * open question (docs/00-prd.md §11) — so this exports the dimension we
 * actually have (cost center) rather than fabricate a GL account column.
 * One row per invoice; costCenterCodes lists every distinct cost center
 * touched by that invoice's lines (semicolon-joined) since an invoice can
 * span more than one via multi-PO/multi-requisition lines.
 */
@Injectable()
export class GlExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportCsv(orgId: string): Promise<string> {
    const client = forOrg(this.prisma, orgId);
    const invoices = await client.invoice.findMany({
      where: { status: { in: ['APPROVED_FOR_PAYMENT', 'PAID'] } },
      include: {
        vendor: true,
        lines: {
          include: {
            poLine: {
              include: {
                requisitionAllocs: {
                  include: { requisitionLine: { include: { requisition: true } } },
                },
              },
            },
          },
        },
      },
      orderBy: { invoiceDate: 'asc' },
    });

    const costCentersByInvoice = await Promise.all(
      invoices.map(async (invoice) => {
        const costCenterIds = new Set<string>();
        for (const line of invoice.lines) {
          for (const alloc of line.poLine.requisitionAllocs) {
            costCenterIds.add(alloc.requisitionLine.requisition.costCenterId);
          }
        }
        if (costCenterIds.size === 0) return '';
        const costCenters = await client.costCenter.findMany({
          where: { id: { in: [...costCenterIds] } },
        });
        return costCenters.map((c) => c.code).join(';');
      }),
    );

    const rows = invoices.map((invoice, i) => [
      invoice.id,
      invoice.invoiceNumber,
      invoice.vendor.legalName,
      invoice.vendor.gstin ?? '',
      costCentersByInvoice[i],
      invoice.currency,
      invoice.subtotalMinorUnits,
      invoice.taxMinorUnits,
      invoice.totalMinorUnits,
      invoice.status,
      invoice.invoiceDate.toISOString().slice(0, 10),
    ]);

    return toCsv([CSV_HEADER, ...rows]);
  }
}
