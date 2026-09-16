# Phase 0 Engineering Tickets

Scope: full P2P loop end-to-end (requisition → approval → PO → GRN → invoice → match →
payment tracking → CSV GL export), per [00-prd.md](00-prd.md) §10. Ticket IDs are
referenced in commit messages and PR titles (e.g. `P2P-014`). Sizes are rough:
S = <1 day, M = 1–3 days, L = 3–5 days.

## Epic A — Foundation

- **P2P-001** (L) Repo scaffold: NestJS backend + Next.js frontend monorepo, shared
  TS types package, ESLint/Prettier config matching Losung360 conventions, CI
  (lint + typecheck + test on PR).
  - AC: `pnpm dev` runs both apps locally; CI fails on lint/type errors.
- **P2P-002** (M) Postgres + Prisma setup, base schema for `Org`, `User` (synced from
  Central Login), `CostCenter`. Multi-tenant row scoping via `org_id` on every table
  from the start.
  - AC: every query in a shared Prisma client helper enforces `org_id` filter; a test
    proves cross-org query returns nothing.
- **P2P-003** (M) Integrate Losung360 Central Login SSO (OIDC) — session middleware,
  role claims mapped to local `Role` enum (Requester/Approver/Buyer/Receiver/AP/
  Controller/Admin).
  - AC: unauthenticated request to any API route returns 401; role-gated route
    returns 403 for wrong role.
- **P2P-004** (S) Audit log infra: polymorphic `AuditLogEntry` table + a
  `recordAudit()` helper wired into every mutating service method.
  - AC: creating/updating a requisition writes an audit row with actor, before/after.
- **P2P-005** (S) S3 bucket + signed-URL upload/download helper, scoped per `org_id`
  prefix.
  - AC: uploading a file from Org A and fetching its URL as Org B's session fails.
- **P2P-006** (M) Notification hook into Losung360 platform notification center
  (approval requests, escalations, match exceptions) — abstract behind an interface
  so the real integration can land without touching call sites.
  - AC: a stub notifier logs calls in dev; interface matches what Central Login's
    notification API expects (confirm shape with platform team before building).

## Epic B — Vendor Management

- **P2P-010** (M) Vendor CRUD (legal name, GSTIN/tax ID, bank details, payment terms,
  contacts, status Active/On Hold/Blacklisted).
  - AC: On Hold/Blacklisted vendors are excluded from the PO vendor picker.
- **P2P-011** (S) Vendor spend summary (total committed, total paid, avg
  invoice-to-payment days) — simple aggregate query, no caching needed at Phase 0
  volumes.

## Epic C — Requisition & Approval

- **P2P-020** (L) Requisition CRUD: header + line items, draft/submit/withdraw/clone,
  estimated total calculation, attachments via S3.
  - AC: submitting with zero line items is rejected; draft can be edited freely,
    submitted cannot (must withdraw first).
- **P2P-021** (L) Approval rule engine: rules keyed on org/department/cost
  center/amount band → ordered approver list. Admin UI to create/edit rules.
  - AC: changing a rule does not retroactively alter an in-flight requisition's
    already-resolved chain.
- **P2P-022** (M) Approval action flow: approve/reject(reason)/request-changes,
  sequential routing, full audit trail per action.
  - AC: an approver can only act on requisitions currently at their step; acting out
    of turn is rejected server-side.
- **P2P-023** (M) SLA escalation job (BullMQ scheduled): reminder at 48h, escalate to
  approver's manager at 96h (both configurable).
  - AC: job is idempotent — re-running it does not double-notify.
- **P2P-024** (M) Requisition list/detail UI: status filters, my-approvals-pending
  view, requisition detail with timeline of actions.

## Epic D — Purchase Order

- **P2P-030** (L) Convert approved requisition(s) → PO: support split (one
  requisition → multiple vendor POs) and consolidate (multiple requisitions → one
  PO), with junction table linking `RequisitionLine` ↔ `POLine`.
  - AC: a PO always traces back to at least one requisition line; total PO line qty
    cannot exceed the sum of linked requisition line qty without override.
- **P2P-031** (M) PO approval-on-variance: if negotiated total exceeds linked
  requisition estimate by more than the configurable tolerance (default 10%),
  require re-approval before `Issued`.
- **P2P-032** (M) PO PDF generation + manual "send to vendor" email action (editable
  message, attaches PDF).
- **P2P-033** (S) PO status machine (`Draft → Pending Approval → Issued → Partially
  Received → Fully Received → Closed`, plus `Cancelled`) with guarded transitions.

## Epic E — Goods Receipt

- **P2P-040** (M) GRN entry against an issued PO: per-line received qty, condition
  notes, receipt date; supports multiple partial GRNs per PO.
  - AC: over-receipt beyond tolerance (default 0%) is blocked unless Buyer overrides
    with a logged reason.
- **P2P-041** (S) Service-line confirmation flow (non-physical-goods POs) as an
  alternative to GRN, gated to a designated approver role.
- **P2P-042** (S) PO status auto-updates from GRN completeness (Partially/Fully
  Received) computed from cumulative GRN qty vs. PO qty.

## Epic F — Invoice & Matching

- **P2P-050** (M) Invoice entry: manual field entry + file upload (PDF/image to S3),
  link to one or more POs. Schema includes a nullable `ocrExtractedData` JSON field,
  unused in Phase 0 (stub for Phase 1 OCR).
  - AC: an invoice must link to at least one PO before it can be submitted.
- **P2P-051** (S) Duplicate-invoice detection (same vendor + invoice number, flagged
  before submit; hard block on exact vendor+number+amount duplicate).
- **P2P-052** (L) Matching engine: 2-way (Invoice vs. PO) and 3-way (Invoice vs. PO vs.
  GRN) with configurable tolerance bands (price %, qty must not exceed received).
  Runs synchronously on submit, target <2s.
  - AC: a clean match within tolerance auto-transitions invoice to "Approved for
    Payment" (unless org config requires AP sign-off even on clean matches);
    out-of-tolerance creates a `MatchException` record with a diff payload.
- **P2P-053** (M) Match Exception queue UI: PO/GRN/Invoice diff view, resolution
  actions (request credit note / adjust & re-match / manual override with audit
  reason).

## Epic G — Payment

- **P2P-060** (M) Payment batch creation: filter approved invoices by due
  date/vendor/amount/cost center, group into a batch.
- **P2P-061** (M) Second-approver control: batches above configurable threshold
  require Finance Controller approval before release.
  - AC: releasing a batch above threshold without Controller approval is rejected
    server-side (not just hidden in UI).
- **P2P-062** (S) Payment release recording: method, reference number, date; supports
  partial payment and one payment covering multiple invoices.
- **P2P-063** (S) Bank statement CSV import + manual reconciliation match against
  released payments (mark "Cleared").

## Epic H — GL Export & Reporting

- **P2P-070** (M) CSV export of postable entries (vendor, GL account/cost center,
  amount, tax breakdown) for approved-for-payment and paid invoices.
- **P2P-071** (M) Core dashboards: open PO commitment total, AP aging, invoice-to-
  payment cycle time, requisition SLA compliance rate.

## Epic I — Cross-cutting

- **P2P-080** (M) Multi-currency support on PO/Invoice: transaction currency + rate
  captured at entry time, converted to org base currency for reporting (rate entry is
  manual in Phase 0 pending §11 open question on FX source).
- **P2P-081** (S) Seed script: demo org, cost centers, vendors, a full sample
  requisition→payment chain for local dev and demos.
- **P2P-082** (M) E2E test: full happy-path flow (requisition → approval → PO → GRN →
  invoice → clean match → payment) as a single integration test suite.

## Sequencing note

A–C should land first (nothing else works without auth/tenancy/requisitions), then D–E
(PO/GRN) can proceed in parallel with early F work (invoice entry UI, independent of
matching logic), with F's matching engine (P2P-052) blocking on D and E being done.
G and H depend on F. P2P-081/082 should be done continuously alongside each epic, not
saved for the end.
