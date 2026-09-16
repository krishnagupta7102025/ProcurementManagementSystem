# Claude Code Prompts — Phase 0 Build

Copy/paste these into Claude Code in this repo, one at a time, roughly in order. Each
prompt assumes CLAUDE.md and the PRD are already loaded (they auto-load / are linked).
Adjust ticket ranges if you reorder work. Run `/code-review` after each epic before
moving on.

## 1. Foundation (P2P-001 → P2P-006)

```
Implement tickets P2P-001 through P2P-006 from docs/10-phase-0-tickets.md (Epic A —
Foundation). Set up the NestJS + Next.js monorepo, Prisma schema for Org/User/
CostCenter with org_id row scoping enforced at the query-helper level, Central Login
OIDC integration, the polymorphic AuditLogEntry table with a recordAudit() helper, S3
signed-URL helpers scoped by org_id, and a notification-center interface with a dev
stub. Write a test proving cross-org queries return nothing. Stop and ask me before
guessing at the Central Login OIDC endpoint shapes or the notification-center API
contract — check docs/00-prd.md open questions first.
```

## 2. Vendor Management (P2P-010 → P2P-011)

```
Implement Epic B — Vendor Management (P2P-010, P2P-011) from
docs/10-phase-0-tickets.md. Vendor CRUD with status Active/On Hold/Blacklisted, and
exclude On Hold/Blacklisted vendors from any PO vendor picker. Add the vendor spend
summary aggregate (total committed from open POs, total paid, avg invoice-to-payment
days). Follow the money-handling convention in CLAUDE.md (integer minor units + ISO
currency, no floats).
```

## 3. Requisition & Approval (P2P-020 → P2P-024)

```
Implement Epic C — Requisition & Approval (P2P-020 through P2P-024) from
docs/10-phase-0-tickets.md. Build the requisition CRUD (header + lines, draft/submit/
withdraw/clone), the data-driven approval rule engine (org/department/cost-center/
amount-band → ordered approver list, per docs/00-prd.md §4.2), the approve/reject/
request-changes action flow with server-side turn enforcement, the BullMQ SLA
escalation job (48h reminder / 96h escalate, idempotent), and the requisition list/
detail UI including a "my approvals pending" view. Make sure changing an approval
rule never retroactively changes an already-resolved in-flight chain.
```

## 4. Purchase Order (P2P-030 → P2P-033)

```
Implement Epic D — Purchase Order (P2P-030 through P2P-033) from
docs/10-phase-0-tickets.md. Support both splitting one requisition across multiple
vendor POs and consolidating multiple requisitions into one PO, via a
RequisitionLine<->POLine junction table — every PO line must trace back to at least
one requisition line. Add the PO approval-on-variance check (>10% over the linked
requisition estimate, configurable) before a PO can move to Issued. Add PO PDF
generation and a manual send-to-vendor email action. Implement the PO status machine
with guarded transitions per docs/00-prd.md §4.3.
```

## 5. Goods Receipt (P2P-040 → P2P-042)

```
Implement Epic E — Goods Receipt (P2P-040 through P2P-042) from
docs/10-phase-0-tickets.md. GRN entry against an issued PO with per-line received
qty and condition notes, supporting multiple partial GRNs per PO. Block over-receipt
beyond the configurable tolerance (default 0%) unless a Buyer overrides with a logged
reason. Add the service-line confirmation flow as an alternative to physical GRN, and
auto-update PO status (Partially/Fully Received) from cumulative GRN quantities.
```

## 6. Invoice & Matching (P2P-050 → P2P-053)

```
Implement Epic F — Invoice & Matching (P2P-050 through P2P-053) from
docs/10-phase-0-tickets.md. This is the highest-risk epic — read docs/00-prd.md §4.5
and §4.6 carefully before writing the matching engine. Build invoice entry (manual
fields + S3 file upload, link to one or more POs, include an unused nullable
ocrExtractedData JSON field as a Phase 1 stub), duplicate-invoice detection, and the
2-way/3-way matching engine with configurable tolerance bands. A clean match should
auto-transition the invoice to "Approved for Payment" unless org config requires AP
sign-off even on clean matches. Out-of-tolerance invoices create a MatchException
with a full PO/GRN/Invoice diff payload, surfaced in a Match Exception queue UI with
resolution actions (request credit note / adjust & re-match / manual override with
audit reason). Target <2s synchronous matching time; write a test with at least one
clean-match case and one out-of-tolerance case per tolerance dimension (price, qty).
```

## 7. Payment (P2P-060 → P2P-063)

```
Implement Epic G — Payment (P2P-060 through P2P-063) from
docs/10-phase-0-tickets.md. Payment batch creation with filters (due date, vendor,
amount, cost center), the second-approver control enforced server-side (batches above
a configurable threshold cannot be released without Finance Controller approval —
write a test that attempts to bypass this via direct API call and confirm it's
rejected), payment release recording (method, reference, date, supports partial and
multi-invoice payments), and bank statement CSV import with manual reconciliation
matching against released payments.
```

## 8. GL Export & Reporting (P2P-070 → P2P-071)

```
Implement Epic H — GL Export & Reporting (P2P-070, P2P-071) from
docs/10-phase-0-tickets.md. CSV export of postable entries (vendor, GL account/cost
center, amount, tax breakdown) for approved-for-payment and paid invoices. Build the
core dashboards: open PO commitment total, AP aging, invoice-to-payment cycle time,
requisition SLA compliance rate.
```

## 9. Cross-cutting: multi-currency, seed data, E2E (P2P-080 → P2P-082)

```
Implement Epic I — Cross-cutting (P2P-080 through P2P-082) from
docs/10-phase-0-tickets.md. Add multi-currency support on PO/Invoice (transaction
currency + rate captured at entry time, manual rate entry for now per the open FX
question in docs/00-prd.md §11), a seed script with a demo org/cost centers/vendors
and one full sample requisition-to-payment chain, and a single end-to-end integration
test that exercises the full happy path: requisition -> approval -> PO -> GRN ->
invoice -> clean match -> payment.
```

## Ongoing

```
Run /code-review on the current diff before I merge this epic's work.
```

```
Check docs/00-prd.md open questions (§11) — has anything here been answered in our
conversation that I should now go update in the PRD before continuing?
```
