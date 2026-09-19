-- CreateEnum
CREATE TYPE "PaymentBatchStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RELEASED', 'CANCELLED');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "paidAmountMinorUnits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "payment_batches" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" "PaymentBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmountMinorUnits" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "method" TEXT,
    "referenceNumber" TEXT,
    "paymentDate" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_batch_lines" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "paymentBatchId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountMinorUnits" INTEGER NOT NULL,

    CONSTRAINT "payment_batch_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amountMinorUnits" INTEGER NOT NULL,
    "reference" TEXT,
    "matchedPaymentBatchId" TEXT,
    "matchedById" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_batches_orgId_idx" ON "payment_batches"("orgId");

-- CreateIndex
CREATE INDEX "payment_batches_orgId_status_idx" ON "payment_batches"("orgId", "status");

-- CreateIndex
CREATE INDEX "payment_batch_lines_orgId_idx" ON "payment_batch_lines"("orgId");

-- CreateIndex
CREATE INDEX "payment_batch_lines_paymentBatchId_idx" ON "payment_batch_lines"("paymentBatchId");

-- CreateIndex
CREATE INDEX "payment_batch_lines_invoiceId_idx" ON "payment_batch_lines"("invoiceId");

-- CreateIndex
CREATE INDEX "bank_statement_lines_orgId_idx" ON "bank_statement_lines"("orgId");

-- CreateIndex
CREATE INDEX "bank_statement_lines_orgId_matchedPaymentBatchId_idx" ON "bank_statement_lines"("orgId", "matchedPaymentBatchId");

-- AddForeignKey
ALTER TABLE "payment_batches" ADD CONSTRAINT "payment_batches_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_batches" ADD CONSTRAINT "payment_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_batches" ADD CONSTRAINT "payment_batches_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_batches" ADD CONSTRAINT "payment_batches_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_batch_lines" ADD CONSTRAINT "payment_batch_lines_paymentBatchId_fkey" FOREIGN KEY ("paymentBatchId") REFERENCES "payment_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_batch_lines" ADD CONSTRAINT "payment_batch_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_matchedPaymentBatchId_fkey" FOREIGN KEY ("matchedPaymentBatchId") REFERENCES "payment_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_matchedById_fkey" FOREIGN KEY ("matchedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

