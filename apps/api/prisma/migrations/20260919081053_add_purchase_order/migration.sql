-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ISSUED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "status" "POStatus" NOT NULL DEFAULT 'DRAFT',
    "negotiatedTotalMinorUnits" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "deliveryDate" TIMESTAMP(3),
    "billToAddress" TEXT,
    "shipToAddress" TEXT,
    "pdfS3Key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_lines" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPriceMinorUnits" INTEGER NOT NULL,

    CONSTRAINT "po_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_line_requisition_lines" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "poLineId" TEXT NOT NULL,
    "requisitionLineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "po_line_requisition_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_orders_orgId_idx" ON "purchase_orders"("orgId");

-- CreateIndex
CREATE INDEX "purchase_orders_orgId_status_idx" ON "purchase_orders"("orgId", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_orgId_vendorId_idx" ON "purchase_orders"("orgId", "vendorId");

-- CreateIndex
CREATE INDEX "po_lines_orgId_idx" ON "po_lines"("orgId");

-- CreateIndex
CREATE INDEX "po_lines_purchaseOrderId_idx" ON "po_lines"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "po_line_requisition_lines_orgId_idx" ON "po_line_requisition_lines"("orgId");

-- CreateIndex
CREATE INDEX "po_line_requisition_lines_poLineId_idx" ON "po_line_requisition_lines"("poLineId");

-- CreateIndex
CREATE INDEX "po_line_requisition_lines_requisitionLineId_idx" ON "po_line_requisition_lines"("requisitionLineId");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_line_requisition_lines" ADD CONSTRAINT "po_line_requisition_lines_poLineId_fkey" FOREIGN KEY ("poLineId") REFERENCES "po_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_line_requisition_lines" ADD CONSTRAINT "po_line_requisition_lines_requisitionLineId_fkey" FOREIGN KEY ("requisitionLineId") REFERENCES "requisition_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

