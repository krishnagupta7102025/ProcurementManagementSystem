-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'BLACKLISTED');

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "gstin" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "status" "VendorStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_contacts" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,

    CONSTRAINT "vendor_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendors_orgId_idx" ON "vendors"("orgId");

-- CreateIndex
CREATE INDEX "vendors_orgId_status_idx" ON "vendors"("orgId", "status");

-- CreateIndex
CREATE INDEX "vendor_contacts_orgId_idx" ON "vendor_contacts"("orgId");

-- CreateIndex
CREATE INDEX "vendor_contacts_vendorId_idx" ON "vendor_contacts"("vendorId");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

