# Build Guide (Human Runbook)

Practical setup/run instructions for this repo. This is the human-facing companion to
[00-prd.md](00-prd.md) (what to build) and [20-prompts.md](20-prompts.md) (how to ask
Claude Code to build it).

## Prerequisites

- Node.js 20+, pnpm 9+
- Docker (for local Postgres + Redis)
- AWS CLI configured with access to the dev S3 bucket (or use a local MinIO container
  for fully offline dev — see `docker-compose.yml` once P2P-001 lands)
- Access to Losung360 Central Login dev/staging OIDC credentials (ask platform team)

## First-time setup

```bash
git clone <this-repo>
cd p2p
pnpm install
cp .env.example .env        # fill in DB, Redis, S3, Central Login OIDC values
docker compose up -d        # starts local Postgres + Redis
pnpm --filter api prisma migrate dev
pnpm --filter api prisma db seed   # runs P2P-081 seed script once it exists
```

## Running locally

```bash
pnpm dev
```

This runs both the NestJS API and the Next.js frontend in watch mode (see
[CLAUDE.md](../CLAUDE.md) for the exact ports once P2P-001 scaffolds them).

## Environment variables (fill in `.env` from `.env.example`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string (cache + BullMQ) |
| `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Document storage |
| `CENTRAL_LOGIN_OIDC_ISSUER`, `CENTRAL_LOGIN_CLIENT_ID`, `CENTRAL_LOGIN_CLIENT_SECRET` | SSO |
| `NOTIFICATION_CENTER_API_URL` | Losung360 platform notification integration |

## Tests

```bash
pnpm test          # unit tests
pnpm test:e2e       # end-to-end (P2P-082 happy-path suite)
```

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
