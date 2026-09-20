import { BadRequestException } from '@nestjs/common';

export interface FxConversion {
  fxRateToBase: number;
  baseCurrencyTotalMinorUnits: number;
}

/**
 * P2P-080: converts a transaction-currency amount into the org's base
 * currency. When the transaction currency already IS the base currency,
 * the rate is exactly 1 rather than left unset — so every PO/Invoice has a
 * populated baseCurrencyTotalMinorUnits and reporting never needs to
 * null-check before summing across currencies.
 *
 * fxRateToBase is manual entry in Phase 0 (FX rate source is an open
 * question, docs/00-prd.md §11) — required only when the currencies
 * differ, never guessed.
 */
export function convertToBaseCurrency(
  transactionCurrency: string,
  baseCurrency: string,
  amountMinorUnits: number,
  fxRateToBase: number | undefined,
): FxConversion {
  if (transactionCurrency === baseCurrency) {
    return { fxRateToBase: 1, baseCurrencyTotalMinorUnits: amountMinorUnits };
  }

  if (fxRateToBase === undefined || fxRateToBase <= 0) {
    throw new BadRequestException(
      `fxRateToBase is required when currency (${transactionCurrency}) differs from the org's base currency (${baseCurrency})`,
    );
  }

  return {
    fxRateToBase,
    baseCurrencyTotalMinorUnits: Math.round(amountMinorUnits * fxRateToBase),
  };
}
