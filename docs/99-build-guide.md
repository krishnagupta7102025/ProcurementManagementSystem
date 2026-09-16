# Build Guide (Human Runbook)

Practical setup/run instructions for this repo. This is the human-facing companion to
[00-prd.md](00-prd.md) (what to build) and [20-prompts.md](20-prompts.md) (how to ask
Claude Code to build it).

## Prerequisites

- Node.js 24+ (LTS), pnpm 9+ (`corepack enable && corepack prepare pnpm@9 --activate`)
- Docker (for local Postgres + Redis) — **or**, if you don't have Docker, run
  `pnpm --filter api exec prisma dev --detach` instead: Prisma 7 ships a real local
  Postgres you can run standalone. Redis still needs Docker (or a native install) for
  the BullMQ-backed tickets.
- AWS CLI configured with access to the dev S3 bucket (or point `S3_*` env vars at a
  local MinIO container for fully offline dev)
- Access to Losung360 Central Login dev/staging OIDC credentials (ask platform team) —
  until that's available, `CENTRAL_LOGIN_OIDC_ISSUER` can be left blank; every guarded
  route will correctly 401 rather than silently allow access.

## First-time setup

```bash
git clone <this-repo>
cd p2p
pnpm install
cp .env.example apps/api/.env    # fill in DB, Redis, S3, Central Login OIDC values
docker compose up -d             # starts local Postgres + Redis
pnpm --filter api run db:migrate
pnpm --filter api run db:seed    # runs P2P-081 seed script once it exists
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

| Variable                                                                              | Purpose                                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------- |
| `DATABASE_URL`                                                                        | Postgres connection string                  |
| `REDIS_URL`                                                                           | Redis connection string (cache + BullMQ)    |
| `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`                | Document storage                            |
| `CENTRAL_LOGIN_OIDC_ISSUER`, `CENTRAL_LOGIN_CLIENT_ID`, `CENTRAL_LOGIN_CLIENT_SECRET` | SSO                                         |
| `NOTIFICATION_CENTER_API_URL`                                                         | Losung360 platform notification integration |

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

Not yet defined for this module — follow whatever CI/CD pattern the platform team
uses for other Losung360 services (ShipMaxx, SupplySphere) once this reaches a
deployable milestone. Do not stand up new infra ad hoc; check with platform/infra
before provisioning AWS resources beyond local dev.

## Definition of done for Phase 0

All tickets in [10-phase-0-tickets.md](10-phase-0-tickets.md) implemented and tested,
the P2P-082 end-to-end happy-path test passing in CI, and every open question in
[00-prd.md](00-prd.md) §11 either answered (PRD updated) or explicitly deferred with a
noted owner.
