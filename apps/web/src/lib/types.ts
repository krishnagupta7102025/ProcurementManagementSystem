// Minimal shapes matching the API's actual JSON responses — just what the
// UI reads, not full mirrors of the Prisma models.

export interface VendorContact {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface Vendor {
  id: string;
  legalName: string;
  gstin?: string | null;
  status: 'ACTIVE' | 'ON_HOLD' | 'BLACKLISTED';
  paymentTermsDays: number;
  contacts: VendorContact[];
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  department: string;
  isActive: boolean;
}

export type UserRole = 'REQUESTER' | 'APPROVER' | 'BUYER' | 'RECEIVER' | 'AP' | 'CONTROLLER' | 'ADMIN';

export interface OrgUser {
  id: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  managerId?: string | null;
  createdAt: string;
}

export interface RequisitionLine {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  estimatedUnitPriceMinorUnits: number;
}

export interface ApprovalStep {
  id: string;
  stepOrder: number;
  approverUserId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  reason?: string | null;
  becameActiveAt?: string | null;
  actedAt?: string | null;
  approver?: { displayName: string; email: string };
}

export interface Requisition {
  id: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'WITHDRAWN';
  department: string;
  costCenterId: string;
  costCenter?: CostCenter;
  justification?: string | null;
  estimatedTotalMinorUnits: number;
  currency: string;
  requesterId: string;
  requester?: { displayName: string; email: string };
  lines: RequisitionLine[];
  approvalSteps?: ApprovalStep[];
  createdAt: string;
}

export interface PendingApprovalStep {
  id: string;
  requisitionId: string;
  stepOrder: number;
  becameActiveAt?: string | null;
  requisition: Requisition;
}

export interface POLineAllocation {
  requisitionLineId: string;
  quantity: number;
  requisitionLine?: RequisitionLine;
}

export interface POLine {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceMinorUnits: number;
  isService: boolean;
  requisitionAllocs: POLineAllocation[];
}

export interface PurchaseOrder {
  id: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'ISSUED' | 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED' | 'CLOSED' | 'CANCELLED';
  vendorId: string;
  vendor?: Vendor;
  buyerId: string;
  negotiatedTotalMinorUnits: number;
  currency: string;
  lines: POLine[];
  sentToVendorAt?: string | null;
  createdAt: string;
}

export interface GoodsReceiptLine {
  id: string;
  poLineId: string;
  quantityReceived: number;
  conditionNotes?: string | null;
  overrideReason?: string | null;
  poLine?: POLine;
}

export interface GoodsReceipt {
  id: string;
  receivedDate: string;
  notes?: string | null;
  lines: GoodsReceiptLine[];
}

export interface InvoiceLine {
  id: string;
  poLineId: string;
  description: string;
  quantity: number;
  unitPriceMinorUnits: number;
  poLine?: POLine;
}

export interface MatchExceptionLineDiff {
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

export interface MatchException {
  id: string;
  invoiceId: string;
  status: 'OPEN' | 'RESOLVED';
  diff: MatchExceptionLineDiff[];
  resolutionAction?: string | null;
  resolutionNotes?: string | null;
  createdAt: string;
  invoice?: Invoice;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  vendorId: string;
  vendor?: Vendor;
  currency: string;
  subtotalMinorUnits: number;
  taxMinorUnits: number;
  totalMinorUnits: number;
  paidAmountMinorUnits: number;
  status: 'DRAFT' | 'SUBMITTED' | 'MATCHED' | 'MATCH_EXCEPTION' | 'APPROVED_FOR_PAYMENT' | 'PAID' | 'VOID';
  lines: InvoiceLine[];
  matchExceptions?: MatchException[];
  createdAt: string;
}

export interface PaymentBatchLine {
  id: string;
  invoiceId: string;
  amountMinorUnits: number;
  invoice?: Invoice;
}

export interface PaymentBatch {
  id: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'RELEASED' | 'CANCELLED';
  totalAmountMinorUnits: number;
  currency: string;
  method?: string | null;
  referenceNumber?: string | null;
  paymentDate?: string | null;
  clearedAt?: string | null;
  lines: PaymentBatchLine[];
  createdAt: string;
}

export interface ApprovalRule {
  id: string;
  name: string;
  department?: string | null;
  costCenterId?: string | null;
  minAmountMinorUnits: number;
  maxAmountMinorUnits?: number | null;
  steps: { stepOrder: number; approverUserId: string }[];
}
