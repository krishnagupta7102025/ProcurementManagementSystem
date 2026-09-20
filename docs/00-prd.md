# Losung360 Procure-to-Pay (P2P) — Product Requirements Document

**Status:** Draft v1 — Phase 0 implementation complete
**Document Owner:** Krishna Gupta
**Last Updated:** 2026-09-20

## 1. Product Vision

Procure-to-Pay (P2P) is a Losung360 platform module that gives finance and operations
teams a single, auditable system for the full purchasing lifecycle: raising a
requisition, getting it approved, issuing a purchase order, receiving goods, matching
the vendor invoice against the PO and receipt, and releasing payment. It plugs into
Losung360 Central Login for SSO, roles, and subscription management, following the
same architectural pattern as ShipMaxx, SupplySphere, and StockBridge.

Today, procurement inside Losung360 (and for the merchants it may later be offered to)
is spread across email threads, spreadsheets, and manual accounting entries. There is
no single source of truth for "what did we commit to buy, what did we receive, and
what have we paid for" — which causes duplicate payments, missed early-payment
discounts, no spend visibility, and slow month-end close.

## 2. Goals

1. One system of record for requisitions, POs, goods receipts, invoices, and payments.
2. Enforce approval policy automatically (spend limits, multi-level sign-off) instead
   of relying on email/Slack approvals.
3. Reduce invoice-to-payment cycle time via automated 2-way/3-way matching.
4. Give finance real-time visibility into committed spend (open POs) vs. actual spend
   (paid invoices) — not just after month-end reconciliation.
5. Produce a clean, exportable audit trail for every rupee committed and paid.

### Non-goals (for this version)

- Sourcing/RFQ/vendor bidding workflows (vendor is assumed already onboarded).
- Contract lifecycle management (contract repository, renewal alerts).
- Full general-ledger / double-entry bookkeeping — P2P produces postable entries and
  exports them; it does not replace the accounting system of record (Tally / Zoho
  Books / QuickBooks — exact target is an open question, see §11).
- Multi-currency FX hedging or treasury management (basic multi-currency invoice
  entry is in scope; FX risk management is not).

## 3. Users & Roles

| Role                            | Description                                              | Key permissions                                                                      |
| ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Requester                       | Any employee who needs to buy something                  | Create requisitions, view own requisition status                                     |
| Approver                        | Manager / budget owner                                   | Approve/reject requisitions and POs within their delegated limit                     |
| Procurement / Buyer             | Converts approved requisitions into POs, manages vendors | Create/send POs, manage vendor master, negotiate terms                               |
| Warehouse / Receiver            | Confirms goods/services received                         | Create GRNs against POs, flag discrepancies                                          |
| Finance / AP (Accounts Payable) | Processes invoices and payments                          | Enter/upload invoices, run matching, schedule/release payments, export to accounting |
| Finance Controller              | Senior finance approver                                  | Approve payment batches above threshold, view all spend analytics                    |
| Vendor (external, later phase)  | Supplier                                                 | View PO, submit invoice via portal (Phase 1+)                                        |
| Admin                           | Org/tenant admin                                         | Configure approval rules, spend limits, GL/cost-center mapping, user-role assignment |

Roles are additive and configurable per org — a small org may collapse Buyer and AP
into one person; the system must not hardcode a 1:1 role-to-person assumption.

## 4. Core Workflow

```
Requisition → Approval → Purchase Order → Goods Receipt (GRN) → Invoice → Match → Payment → GL Export
```

See [workflow.svg](workflow.svg) / [workflow.png](workflow.png) for the visual flowchart,
including rejection/exception branches.

### 4.1 Requisition (PR)

- Requester creates a Purchase Requisition: line items (description, quantity, unit,
  estimated unit price), cost center, department, needed-by date, justification, and
  optional attachments (quotes, spec sheets).
- System calculates estimated total and routes to the approval chain resolved from
  the requester's cost center + amount (see §4.2).
- Requester can save as draft, submit, withdraw (before approval starts), or clone a
  past requisition.

### 4.2 Approval

- Approval chains are rule-based, not hardcoded: rules match on org, department,
  cost center, and amount bands, and resolve to an ordered list of approvers
  (e.g., "Marketing, ₹0–50,000 → dept head only"; "any dept, >₹500,000 → dept head
  then Finance Controller").
- Each approver can Approve, Reject (with mandatory reason), or Request Changes
  (sends back to requester, resets chain from that point).
- Approvals are sequential by default; parallel/quorum approval is a Phase 1
  enhancement (flagged as open question, §11).
- Full audit log per requisition: every action, actor, timestamp, and reason.
- Escalation: if an approver takes no action within a configurable SLA (default 48h),
  a reminder notification fires; after a second SLA period it escalates to that
  approver's manager (data-driven, not hardcoded).

### 4.3 Purchase Order (PO)

- Once fully approved, a Buyer converts the requisition into a PO against a specific
  vendor (one requisition may split into multiple POs across vendors; multiple
  requisitions may consolidate into one PO — both must be supported).
- PO carries: vendor, bill-to/ship-to address, line items with final negotiated price,
  payment terms (e.g., Net 30), delivery date, and a link back to the source
  requisition(s) for traceability.
- PO requires its own approval if the negotiated total exceeds the requisition's
  approved estimate by a configurable tolerance (default 10%) — prevents "approve
  cheap, order expensive."
- On approval, PO status becomes `Issued`; system generates a PDF and can email it to
  the vendor contact (manual send with an editable message in v1; Phase 1 vendor
  portal auto-notifies).
- PO statuses: `Draft → Pending Approval → Issued → Partially Received → Fully
Received → Closed`, plus `Cancelled`.

### 4.4 Goods Receipt (GRN)

- Receiver records what actually arrived against an issued PO: quantity received per
  line, condition/quality notes, and receipt date. Partial receipts are supported —
  a PO can have many GRNs.
- Over-receipt beyond a configurable tolerance (default 0%, i.e. blocked) requires
  Buyer override with a reason.
- For service-line POs (no physical goods), a "service confirmation" replaces
  physical GRN — a designated approver confirms the service was delivered.
- GRN is the second leg of the 3-way match (PO / GRN / Invoice).

### 4.5 Invoice

- AP enters or uploads a vendor invoice (PDF/image) and links it to one or more POs.
  Manual field entry (vendor, invoice number, date, line items, tax, total) is
  required in v1. OCR-assisted auto-extraction is a Phase 1 enhancement (see
  [10-phase-0-tickets.md](10-phase-0-tickets.md) — Phase 0 tickets stub the field for
  it but do not implement OCR).
- Duplicate-invoice detection: same vendor + invoice number (+ optionally amount)
  already in the system is flagged before submission.
- Invoice statuses: `Draft → Submitted → Matched / Match Exception → Approved for
Payment → Paid → Cancelled/Void`.

### 4.6 Matching

- **2-way match:** Invoice line items/amounts vs. PO line items/amounts (used when a
  PO has no GRN, e.g. pure services or org policy for low-value POs).
- **3-way match:** Invoice vs. PO vs. GRN — quantities and prices must reconcile
  within configurable tolerance bands (e.g., price ±2%, quantity must not exceed
  received quantity).
- On mismatch, invoice is routed to a Match Exception queue with a diff view
  (PO qty/price vs. GRN qty vs. invoice qty/price) for AP or Buyer to resolve —
  resolution options: request vendor credit note, adjust and re-match, or escalate
  for manual approval override (audit-logged).
- Matched invoices move automatically to "Approved for Payment" if within tolerance;
  no separate human approval step is required purely for a clean match (policy-driven
  automation), but org config can require AP sign-off even on clean matches.

### 4.7 Payment

- AP schedules payment runs: select approved invoices (filterable by due date, vendor,
  amount, cost center), respecting vendor payment terms and any early-payment discount
  windows.
- Payment batches above a configurable threshold require Finance Controller approval
  before release (second-approver control, see [CLAUDE.md](../CLAUDE.md)).
- v1 records payment as "released" with method (bank transfer/cheque/UPI), reference
  number, and date — it does not integrate with a bank's payment-initiation API in
  Phase 0 (see open questions, §11). Actual money movement happens outside the system
  in v1; the system tracks status and reconciles a bank statement import (CSV) against
  released payments to confirm clearing.
- Partial payments and payment against multiple invoices in one bank transaction are
  both supported.

### 4.8 GL Export

- Approved-for-payment and paid invoices generate postable entries (vendor, GL
  account/cost center, amount, tax breakdown) exportable as CSV in Phase 0; direct
  API sync to an accounting system is Phase 1+ (target system TBD, §11).

## 5. Vendor Management (supporting module)

- Vendor master: legal name, GSTIN/tax ID, bank details (for payment reference only —
  not for initiating transfers in v1), default payment terms, contact(s), status
  (Active/On Hold/Blacklisted).
- On-hold or blacklisted vendors cannot be selected on a new PO.
- Vendor-level spend dashboard: total committed (open POs), total paid, average
  invoice-to-payment days.

## 6. Non-Functional Requirements

- **Multi-tenant:** every org's data is isolated (`org_id` scoping at the DB layer);
  no cross-tenant data access under any code path.
- **Audit & compliance:** every financial state transition is immutably logged
  (actor, timestamp, before/after). No hard deletes on requisitions, POs, invoices,
  or payments — only status transitions (e.g., `Cancelled`, `Void`).
- **Money handling:** all amounts stored as integer minor units + ISO currency code;
  no floating-point arithmetic on money anywhere in the codebase.
- **Multi-currency:** a PO/invoice can be in a non-base currency; system stores the
  transaction currency and converts to org base currency using a rate captured at
  transaction time (rate source is an open question, §11).
- **Performance:** requisition/PO list views must return in <1s for orgs with up to
  50,000 open records; matching engine must process a submitted invoice against its
  PO/GRN in <2s synchronously (heavier reconciliation batch jobs run async via
  BullMQ).
- **Security:** SSO via Losung360 Central Login (OIDC) only — no local password auth
  in this module. Role checks enforced server-side on every mutating endpoint, never
  client-side only. Documents (invoices, POs) stored in S3 with per-org-scoped
  access, signed URLs with short TTL.
- **Availability:** target 99.5% for the core approval/PO/invoice flows (finance
  teams work in business hours; this is not a 24/7-critical path like fulfillment).

## 7. Integrations

| Integration                                      | Phase    | Notes                                                        |
| ------------------------------------------------ | -------- | ------------------------------------------------------------ |
| Losung360 Central Login (SSO/RBAC)               | Phase 0  | Required from day one — no standalone auth                   |
| Notification center (Losung360 platform)         | Phase 0  | Approval requests, escalations, match exceptions             |
| Object storage (S3)                              | Phase 0  | PO PDFs, invoice uploads, GRN attachments                    |
| Bank statement CSV import                        | Phase 0  | Manual reconciliation aid only                               |
| Accounting system export (CSV)                   | Phase 0  | Generic CSV; native API sync is Phase 1 (target system TBD)  |
| Invoice OCR/auto-extraction                      | Phase 1  | Field stubbed in schema now, not implemented                 |
| Vendor self-service portal                       | Phase 1  | Vendors currently receive PO via email only                  |
| Payment initiation (bank API / payment gateway)  | Phase 1+ | v1 tracks payment status only, doesn't move money            |
| ERP direct sync (if/when a target ERP is chosen) | Phase 2  | Depends on which accounting system Losung360 standardizes on |

## 8. Data Model (high level)

Core entities: `Org`, `User` (from Central Login), `CostCenter`, `Vendor`,
`Requisition`, `RequisitionLine`, `ApprovalRule`, `ApprovalStep`, `PurchaseOrder`,
`POLine`, `GoodsReceipt`, `GRNLine`, `Invoice`, `InvoiceLine`, `MatchException`,
`PaymentBatch`, `Payment`, `AuditLogEntry`.

Relationships of note:

- `RequisitionLine` → many `POLine` (split across vendors) and `POLine` → many
  `RequisitionLine` (consolidated requisitions) — many-to-many via a junction table.
- `PurchaseOrder` → many `GoodsReceipt` (partial receipts) → many `InvoiceLine`
  matches.
- `AuditLogEntry` is polymorphic (entity type + entity id) and append-only.

Detailed schema/migrations are an engineering deliverable, not fixed in this PRD —
see [10-phase-0-tickets.md](10-phase-0-tickets.md) for the schema design ticket.

## 9. Success Metrics

- Invoice-to-payment cycle time (median days from invoice submission to payment
  release) — target: reduce by 40% vs. current manual process baseline (to be
  measured once baseline data exists).
- % of invoices auto-matched without human touch (clean 3-way match rate).
- % of requisitions approved within SLA (no escalation triggered).
- Zero duplicate payments (tracked via duplicate-invoice detection catch rate).
- Time-to-close: reduction in month-end AP reconciliation time.

## 10. Phasing

- **Phase 0 (complete):** Full P2P loop end-to-end — requisition, approval, PO,
  GRN, invoice entry (manual), 2-way/3-way match, payment tracking (status only, no
  bank API), CSV GL export, vendor master, audit trail, basic multi-currency, and a
  demo seed script. See [10-phase-0-tickets.md](10-phase-0-tickets.md) — every
  ticket implemented and tested except the frontend UI tickets (P2P-024), which are
  blocked on a real Central Login integration (open question below).
- **Phase 1:** Invoice OCR/auto-extraction, vendor self-service portal, parallel/quorum
  approvals, native accounting-system API sync, spend analytics dashboards.
- **Phase 2+:** Payment initiation via bank/payment-gateway API, sourcing/RFQ,
  contract lifecycle management, AI-based spend anomaly detection (consistent with
  the "AI Recommendation Engine" theme in Losung360's platform-wide future scope).

## 11. Open Questions

1. **Target accounting system for GL sync** — Tally, Zoho Books, QuickBooks, or
   something else? Determines Phase 1+ integration design. _(Owner: Krishna Gupta)_
2. **FX rate source** for multi-currency conversion (manual entry vs. an API like
   exchangerate.host / a bank feed)? Phase 0 implements manual entry per the default
   above (P2P-080) — this question is about whether Phase 1+ should automate it.
3. **Payment initiation** — is there an appetite to integrate a bank API / payment
   gateway in a later phase, or will actual fund transfer always stay outside this
   system?
4. **Approval model** — is sequential-only approval acceptable for Phase 0, or is
   parallel/quorum approval (e.g., "any 2 of these 3") needed sooner?
5. Should vendors ever get **portal access** in Phase 0, or is email-only
   communication acceptable until Phase 1?
6. Org/tenant model — is this **single-tenant per Losung360 client** or does it need
   to support one client managing multiple legal entities (multi-entity within one
   org) from day one?
