import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { forOrg } from '../prisma/scoped-prisma.js';

// Price tolerance for both 2-way and 3-way match (P2P-052). Quantity has no
// configurable tolerance — "must not exceed received quantity" is exact,
// per docs/00-prd.md §4.6.
const PRICE_TOLERANCE = Number(process.env.MATCH_PRICE_TOLERANCE ?? 0.02);

export interface MatchLineInput {
  invoiceLineId: string;
  poLineId: string;
  invoiceQuantity: number;
  invoicePriceMinorUnits: number;
  poQuantity: number;
  poPriceMinorUnits: number;
  isService: boolean;
  isServiceConfirmed: boolean;
  /** Cumulative GRN quantity received against this PO line — 0 for service lines. */
  receivedQuantity: number;
}

export interface LineMatchResult {
  invoiceLineId: string;
  poLineId: string;
  matchType: '2-way' | '3-way';
  ok: boolean;
  reasons: string[];
  referencePriceMinorUnits: number;
  invoicePriceMinorUnits: number;
  referenceQuantity: number;
  invoiceQuantity: number;
}

export interface MatchResult {
  ok: boolean;
  lines: LineMatchResult[];
}

/**
 * The matching engine (P2P-052). matchLine is a pure function over plain
 * data so it's directly unit-testable without touching the database — the
 * DB-aware match() method just assembles that data from Prisma includes.
 */
@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  matchLine(input: MatchLineInput): LineMatchResult {
    const reasons: string[] = [];

    const priceDelta = Math.abs(input.invoicePriceMinorUnits - input.poPriceMinorUnits);
    const priceOk = priceDelta <= input.poPriceMinorUnits * PRICE_TOLERANCE;
    if (!priceOk) {
      reasons.push(
        `invoice price ${input.invoicePriceMinorUnits} vs PO price ${input.poPriceMinorUnits} exceeds ${PRICE_TOLERANCE * 100}% tolerance`,
      );
    }

    // Service lines are 2-way (Invoice vs PO) since there's no physical
    // GRN — a confirmation stands in for "received" at all. Physical lines
    // are always 3-way (Invoice vs PO vs GRN), even when nothing has been
    // received yet: that's simply a failing 3-way match, not a 2-way one.
    const matchType: '2-way' | '3-way' = input.isService ? '2-way' : '3-way';
    const referenceQuantity = input.isService ? input.poQuantity : input.receivedQuantity;

    let qtyOk: boolean;
    if (input.isService) {
      if (!input.isServiceConfirmed) {
        reasons.push('service line has not been confirmed as delivered yet');
        qtyOk = false;
      } else {
        qtyOk = input.invoiceQuantity <= input.poQuantity;
        if (!qtyOk)
          reasons.push(
            `invoice quantity ${input.invoiceQuantity} exceeds ordered quantity ${input.poQuantity}`,
          );
      }
    } else {
      if (input.receivedQuantity === 0) {
        reasons.push('no goods have been received against this line yet');
        qtyOk = false;
      } else {
        qtyOk = input.invoiceQuantity <= input.receivedQuantity;
        if (!qtyOk) {
          reasons.push(
            `invoice quantity ${input.invoiceQuantity} exceeds received quantity ${input.receivedQuantity}`,
          );
        }
      }
    }

    return {
      invoiceLineId: input.invoiceLineId,
      poLineId: input.poLineId,
      matchType,
      ok: priceOk && qtyOk,
      reasons,
      referencePriceMinorUnits: input.poPriceMinorUnits,
      invoicePriceMinorUnits: input.invoicePriceMinorUnits,
      referenceQuantity,
      invoiceQuantity: input.invoiceQuantity,
    };
  }

  async match(orgId: string, invoiceId: string): Promise<MatchResult> {
    const client = forOrg(this.prisma, orgId);
    const invoice = await client.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        lines: { include: { poLine: { include: { grnLines: true, serviceConfirmation: true } } } },
      },
    });

    const lines = invoice.lines.map((invLine) =>
      this.matchLine({
        invoiceLineId: invLine.id,
        poLineId: invLine.poLineId,
        invoiceQuantity: invLine.quantity,
        invoicePriceMinorUnits: invLine.unitPriceMinorUnits,
        poQuantity: invLine.poLine.quantity,
        poPriceMinorUnits: invLine.poLine.unitPriceMinorUnits,
        isService: invLine.poLine.isService,
        isServiceConfirmed: invLine.poLine.serviceConfirmation !== null,
        receivedQuantity: invLine.poLine.grnLines.reduce((sum, g) => sum + g.quantityReceived, 0),
      }),
    );

    return { ok: lines.every((l) => l.ok), lines };
  }
}
