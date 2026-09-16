# Losung360 Procure-to-Pay (P2P) — Project Guide

This file is auto-loaded by Claude Code at the start of every session in this repo.

## What this is

An internal Losung360 Procure-to-Pay module: Requisition → Approval → Purchase Order →
Goods Receipt (GRN) → Invoice → 2/3-way Match → Payment → GL export. It follows the same
platform pattern as Losung360's other products (SupplySphere, StockBridge, ShipMaxx): a
module that plugs into Losung360 Central Login (SSO, RBAC, subscriptions).

Read [docs/00-prd.md](docs/00-prd.md) first — it is the source of truth for scope and
behavior. [docs/10-phase-0-tickets.md](docs/10-phase-0-tickets.md) is the current build
backlog. [docs/20-prompts.md](docs/20-prompts.md) has ready-to-use prompts for each build
phase. [docs/99-build-guide.md](docs/99-build-guide.md) has local setup / run instructions.

## Stack (matches existing Losung360 services, e.g. ShipMaxx)

- **Backend:** Node.js, NestJS, TypeScript
- **Frontend:** Next.js (React), TypeScript, Tailwind
- **DB:** PostgreSQL via Prisma ORM (transactional); Redis for cache/sessions/queues
- **Async/jobs:** BullMQ on Redis (invoice OCR ingestion, approval reminders, payment batch runs)
- **Storage:** S3-compatible object storage for PO PDFs, invoices, GRN attachments
- **Infra:** AWS ap-south-1 (Mumbai), multi-AZ; Cloudflare in front of public endpoints
- **Auth:** Losung360 Central Login SSO (OIDC) — this module never rolls its own auth
- **Multi-tenant:** every table is scoped by `org_id`; row-level isolation, no cross-tenant queries

## Conventions

- Money is always integer minor units (paise) + ISO currency code — never floats.
- Every state-changing table (requisitions, POs, invoices, payments) carries an
  immutable audit trail (who, what, when, previous value) — finance data is never
  hard-deleted, only status-transitioned.
- Approval chains are data-driven (configurable rules), not hardcoded role checks.
- All money-moving actions (PO approval past threshold, payment release) require a
  second approver — never a single-person action.
- Match existing Losung360 naming: PascalCase module names (e.g. `PayFlow` if this
  module needs a product name), snake_case DB columns, camelCase TS.

## Working in this repo

- Treat [docs/00-prd.md](docs/00-prd.md) as authoritative for behavior; if code and PRD
  disagree, flag it rather than silently picking one.
- Ticket IDs in [docs/10-phase-0-tickets.md](docs/10-phase-0-tickets.md) (e.g. `P2P-014`)
  should be referenced in commit messages and PR titles.
- Do not invent ERP/accounting integration details (Tally/Zoho Books/QuickBooks field
  mappings) — these are marked as open questions in the PRD; check with the user before
  hardcoding a schema for them.
