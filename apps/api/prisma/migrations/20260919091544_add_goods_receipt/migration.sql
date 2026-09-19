-- AlterTable
ALTER TABLE "po_lines" ADD COLUMN     "isService" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "receivedById" TEXT NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn_lines" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "poLineId" TEXT NOT NULL,
    "quantityReceived" INTEGER NOT NULL,
    "conditionNotes" TEXT,
    "overrideReason" TEXT,

    CONSTRAINT "grn_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_confirmations" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "poLineId" TEXT NOT NULL,
    "confirmedById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "service_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goods_receipts_orgId_idx" ON "goods_receipts"("orgId");

-- CreateIndex
CREATE INDEX "goods_receipts_purchaseOrderId_idx" ON "goods_receipts"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "grn_lines_orgId_idx" ON "grn_lines"("orgId");

-- CreateIndex
CREATE INDEX "grn_lines_goodsReceiptId_idx" ON "grn_lines"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "grn_lines_poLineId_idx" ON "grn_lines"("poLineId");

-- CreateIndex
CREATE UNIQUE INDEX "service_confirmations_poLineId_key" ON "service_confirmations"("poLineId");

-- CreateIndex
CREATE INDEX "service_confirmations_orgId_idx" ON "service_confirmations"("orgId");

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_poLineId_fkey" FOREIGN KEY ("poLineId") REFERENCES "po_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_confirmations" ADD CONSTRAINT "service_confirmations_poLineId_fkey" FOREIGN KEY ("poLineId") REFERENCES "po_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_confirmations" ADD CONSTRAINT "service_confirmations_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

