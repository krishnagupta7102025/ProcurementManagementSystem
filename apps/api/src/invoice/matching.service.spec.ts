import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { MatchingService, type MatchLineInput } from './matching.service.js';

const base: MatchLineInput = {
  invoiceLineId: 'inv-line-1',
  poLineId: 'po-line-1',
  invoiceQuantity: 10,
  invoicePriceMinorUnits: 100,
  poQuantity: 10,
  poPriceMinorUnits: 100,
  isService: false,
  isServiceConfirmed: false,
  receivedQuantity: 10,
};

describe('MatchingService.matchLine (P2P-052)', () => {
  const matching = new MatchingService({} as PrismaService);

  it('is a clean 3-way match when price and quantity both line up with what was received', () => {
    const result = matching.matchLine(base);
    expect(result.ok).toBe(true);
    expect(result.matchType).toBe('3-way');
    expect(result.reasons).toHaveLength(0);
  });

  it('fails when the invoice price exceeds the PO price beyond tolerance', () => {
    const result = matching.matchLine({ ...base, invoicePriceMinorUnits: 110 }); // 10% over, default tolerance 2%
    expect(result.ok).toBe(false);
    expect(result.reasons[0]).toMatch(/tolerance/);
  });

  it('passes when the invoice price is within tolerance of the PO price', () => {
    const result = matching.matchLine({ ...base, invoicePriceMinorUnits: 101 }); // 1% over, within 2% default
    expect(result.ok).toBe(true);
  });

  it('fails a 3-way match when invoice quantity exceeds received quantity, even if within PO quantity', () => {
    const result = matching.matchLine({
      ...base,
      poQuantity: 20,
      receivedQuantity: 5,
      invoiceQuantity: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.matchType).toBe('3-way');
    expect(result.reasons.some((r) => r.includes('exceeds received quantity'))).toBe(true);
  });

  it('fails a 3-way match when nothing has been received yet', () => {
    const result = matching.matchLine({ ...base, receivedQuantity: 0 });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes('no goods have been received'))).toBe(true);
  });

  it('is a clean 2-way match for a confirmed service line within quantity', () => {
    const result = matching.matchLine({
      ...base,
      isService: true,
      isServiceConfirmed: true,
      receivedQuantity: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.matchType).toBe('2-way');
  });

  it('fails a 2-way match when the service has not been confirmed yet', () => {
    const result = matching.matchLine({ ...base, isService: true, isServiceConfirmed: false });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes('not been confirmed'))).toBe(true);
  });

  it('fails a 2-way match when invoice quantity exceeds the ordered quantity', () => {
    const result = matching.matchLine({
      ...base,
      isService: true,
      isServiceConfirmed: true,
      poQuantity: 1,
      invoiceQuantity: 2,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes('exceeds ordered quantity'))).toBe(true);
  });
});
