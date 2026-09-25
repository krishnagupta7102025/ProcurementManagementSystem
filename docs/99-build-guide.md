# Build Guide (Human Runbook)

Practical setup/run instructions for this repo. This is the human-facing companion to
[00-prd.md](00-prd.md) (what to build) and [20-prompts.md](20-prompts.md) (how to ask
Claude Code to build it).

## Prerequisites

- Node.js 24+ (LTS), pnpm 9+ (`corepack enable && corepack prepare pnpm@9 --activate`)
- Docker (for local MySQL) — **or**, if you don't have Docker, a real MySQL 8
  server some other way. Unlike Postgres, Prisma has no embedded/zero-install
  local MySQL (no `prisma dev` equivalent) — a real server is required even
  for local dev. If `prisma migrate dev`'s shadow-database step ever gets
  stuck, generate the migration SQL directly instead of letting it diff:
  `prisma migrate diff --from-config-datasource --to-schema
./prisma/schema.prisma --script`, save the output as a new
  `prisma/migrations/<timestamp>_<name>/migration.sql`, then `prisma migrate
deploy` (which doesn't touch the shadow db at all).
- AWS CLI configured with access to the dev S3 bucket (or point `S3_*` env vars at a
  local MinIO container for fully offline dev) — or set `STORAGE_DRIVER=local` to skip
  S3 entirely for local dev (see `src/storage/dev-local-storage.ts`)
- No external auth provider needed — this module uses its own local email/password
  login (see the Decisions Log in [00-prd.md](00-prd.md) §12). Just set
  `AUTH_JWT_SECRET` to any long random string.

## First-time setup

```bash
git clone <this-repo>
cd p2p
pnpm install
cp .env.example apps/api/.env    # fill in DB, S3, AUTH_JWT_SECRET
docker compose up -d             # starts local MySQL
pnpm --filter api run db:migrate
pnpm --filter api run db:seed    # creates demo users; prints each one's email + shared password
```

## Running locally

```bash
pnpm dev
```

This runs both the NestJS API (`apps/api`, default port 3000) and the Next.js
frontend (`apps/web`, default port 3000 as well — set `PORT` on one of them
if running both at once) in watch mode.

## Verifying everything works

```bash
pnpm run typecheck   # all workspace packages
pnpm run lint        # oxlint (api) + eslint (web)
pnpm run test        # vitest, api (needs DATABASE_URL reachable)
pnpm run build       # nest build + next build
```

## Environment variables (fill in `apps/api/.env` from the root `.env.example`)

| Variable                                                                              | Purpose                                             |
| ------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `DATABASE_URL`                                                                        | MySQL connection string                             |
| `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`                | Document storage (or set `STORAGE_DRIVER=local` to skip) |
| `AUTH_JWT_SECRET`                                                                     | Signs/verifies local login sessions — required, API refuses to boot without it |
| `NOTIFICATION_CENTER_API_URL`                                                         | Losung360 platform notification integration         |
| `APPROVAL_SLA_REMINDER_HOURS`, `APPROVAL_SLA_ESCALATE_HOURS`                          | P2P-023 SLA thresholds (default 48h / 96h)          |
| `CRON_SECRET`                                                                         | Bearer token the escalation-scan endpoint requires (see docs/deploy-aws.md) |

The api's Nest-generated e2e suite (currently just a smoke test) runs separately:

```bash
pnpm --filter api run test:e2e
```

The P2P-082 full happy-path integration test (requisition → payment) will live
alongside the other vitest specs and run via `pnpm run test` once it exists.

## Working with Claude Code on this repo

1. Open the repo in Claude Code — [CLAUDE.md](../CLAUDE.md) auto-loads.
2. Work through [20-prompts.md](20-prompts.md) in order, one epic at a time.
3. After each epic: run `/code-review`, review the diff yourself, then commit
   referencing the ticket IDs (e.g. `feat(P2P-020): requisition CRUD`).
4. If Claude Code hits one of the open questions in [00-prd.md](00-prd.md) §11, it
   should stop and ask rather than guess — treat any guess on those points as a bug.

## Deployment

Hosted on AWS (2026-09-25 decision — see [deploy-aws.md](deploy-aws.md)):
Elastic Beanstalk (Docker platform) for the API, RDS MySQL, S3 for document
storage, and an EventBridge Scheduler rule driving the approval-SLA escalation
endpoint. Earlier GitHub Pages/Vercel deploys
([deploy-github-pages-render.md](deploy-github-pages-render.md),
[deploy-vercel.md](deploy-vercel.md)) are superseded — kept for reference
only.

## Definition of done for Phase 0

All tickets in [10-phase-0-tickets.md](10-phase-0-tickets.md) implemented and tested,
the P2P-082 end-to-end happy-path test passing in CI, and every open question in
[00-prd.md](00-prd.md) §11 either answered (PRD updated) or explicitly deferred with a
noted owner.

**Status: met.** Epics A through I are implemented and tested, including a full
Next.js frontend covering every module (P2P-024 and beyond), authenticated via local
email/password login (see [00-prd.md](00-prd.md) §12 Decisions Log) rather than the
originally-planned Central Login SSO. A demo seed script (`pnpm --filter api run
db:seed`) walks the full requisition→payment chain and prints login credentials for
every demo user.
