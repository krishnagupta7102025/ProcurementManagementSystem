-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "baseCurrencyTotalMinorUnits" INTEGER,
ADD COLUMN     "fxRateToBase" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "orgs" ADD COLUMN     "baseCurrency" TEXT NOT NULL DEFAULT 'INR';

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "baseCurrencyTotalMinorUnits" INTEGER,
ADD COLUMN     "fxRateToBase" DOUBLE PRECISION;

