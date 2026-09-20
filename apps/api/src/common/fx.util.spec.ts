import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { convertToBaseCurrency } from './fx.util.js';

describe('convertToBaseCurrency (P2P-080)', () => {
  it('uses rate 1 and passes the amount through unchanged when currencies match', () => {
    const result = convertToBaseCurrency('INR', 'INR', 10_000, undefined);
    expect(result).toEqual({ fxRateToBase: 1, baseCurrencyTotalMinorUnits: 10_000 });
  });

  it('converts using the given rate when currencies differ', () => {
    const result = convertToBaseCurrency('USD', 'INR', 10_000, 83);
    expect(result).toEqual({ fxRateToBase: 83, baseCurrencyTotalMinorUnits: 830_000 });
  });

  it('rounds the converted amount to the nearest minor unit', () => {
    const result = convertToBaseCurrency('USD', 'INR', 333, 83.333);
    expect(result.baseCurrencyTotalMinorUnits).toBe(Math.round(333 * 83.333));
  });

  it('requires a rate when currencies differ, rather than guessing one', () => {
    expect(() => convertToBaseCurrency('USD', 'INR', 10_000, undefined)).toThrow(
      BadRequestException,
    );
  });

  it('rejects a zero or negative rate', () => {
    expect(() => convertToBaseCurrency('USD', 'INR', 10_000, 0)).toThrow(BadRequestException);
    expect(() => convertToBaseCurrency('USD', 'INR', 10_000, -1)).toThrow(BadRequestException);
  });
});
