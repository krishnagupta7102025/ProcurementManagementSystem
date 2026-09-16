-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApprovalStepStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "managerId" TEXT;

-- CreateTable
CREATE TABLE "requisitions" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "neededByDate" TIMESTAMP(3),
    "justification" TEXT,
    "status" "RequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "estimatedTotalMinorUnits" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisition_lines" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "estimatedUnitPriceMinorUnits" INTEGER NOT NULL,

    CONSTRAINT "requisition_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisition_attachments" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requisition_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_rules" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "costCenterId" TEXT,
    "minAmountMinorUnits" INTEGER NOT NULL DEFAULT 0,
    "maxAmountMinorUnits" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_rule_steps" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "approvalRuleId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "approverUserId" TEXT NOT NULL,

    CONSTRAINT "approval_rule_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "status" "ApprovalStepStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "becameActiveAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "actedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requisitions_orgId_idx" ON "requisitions"("orgId");

-- CreateIndex
CREATE INDEX "requisitions_orgId_status_idx" ON "requisitions"("orgId", "status");

-- CreateIndex
CREATE INDEX "requisitions_orgId_requesterId_idx" ON "requisitions"("orgId", "requesterId");

-- CreateIndex
CREATE INDEX "requisition_lines_orgId_idx" ON "requisition_lines"("orgId");

-- CreateIndex
CREATE INDEX "requisition_lines_requisitionId_idx" ON "requisition_lines"("requisitionId");

-- CreateIndex
CREATE INDEX "requisition_attachments_orgId_idx" ON "requisition_attachments"("orgId");

-- CreateIndex
CREATE INDEX "requisition_attachments_requisitionId_idx" ON "requisition_attachments"("requisitionId");

-- CreateIndex
CREATE INDEX "approval_rules_orgId_idx" ON "approval_rules"("orgId");

-- CreateIndex
CREATE INDEX "approval_rule_steps_orgId_idx" ON "approval_rule_steps"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_rule_steps_approvalRuleId_stepOrder_key" ON "approval_rule_steps"("approvalRuleId", "stepOrder");

-- CreateIndex
CREATE INDEX "approval_steps_orgId_idx" ON "approval_steps"("orgId");

-- CreateIndex
CREATE INDEX "approval_steps_orgId_approverUserId_status_idx" ON "approval_steps"("orgId", "approverUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_requisitionId_stepOrder_key" ON "approval_steps"("requisitionId", "stepOrder");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_attachments" ADD CONSTRAINT "requisition_attachments_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_rule_steps" ADD CONSTRAINT "approval_rule_steps_approvalRuleId_fkey" FOREIGN KEY ("approvalRuleId") REFERENCES "approval_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_rule_steps" ADD CONSTRAINT "approval_rule_steps_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

