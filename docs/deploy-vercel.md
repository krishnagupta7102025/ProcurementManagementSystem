# Deploying: Vercel (frontend + API) + Neon (Postgres) + R2 (storage)

Both the frontend and API run on Vercel now. The API deploys via Vercel's
built-in **zero-config NestJS support** — Vercel auto-detects `src/main.ts`
(it specifically looks for a direct `NestFactory.create(AppModule)` call in
that file, so don't refactor the bootstrap into a helper module — that's
what broke it the first time) and wraps the whole app as one Vercel
Function. No custom `api/` folder or rewrite rules needed.

Vercel is serverless — there's no long-lived process, so the one thing
that had to change from local dev is the approval-SLA background job: it
used to be a BullMQ worker polling Redis every 15 minutes, and is now a
**Vercel Cron Job** that hits a protected endpoint once a day
(`apps/api/vercel.json`). One real consequence: reminders/escalations are
now checked once daily instead of every 15 minutes — coarser, but the
underlying 48h/96h thresholds are generous enough that this is a
reasonable trade for not needing Redis at all anymore. On a paid Vercel
plan you can tighten the schedule (Hobby caps cron at once/day; Pro allows
hourly or more).

| Piece                    | Host                                               |
| ------------------------ | --------------------------------------------------- |
| Frontend                 | Vercel (already live)                               |
| API                      | Vercel (separate project, Root Directory `apps/api`) |
| Postgres                 | Neon, or Vercel's own Postgres storage tab (same thing, Neon under the hood) |
| File storage (S3-compat.)| Cloudflare R2 (free tier, no code changes)          |
| Redis                    | Not needed anymore                                  |

**Order matters**: the API needs to exist before you know its URL to
configure the already-deployed frontend, and the frontend's URL is needed
to lock down the API's CORS setting. Steps 1-2 can happen in either order;
steps 3-5 are sequential.

## 1. Database — Neon (or Vercel's Postgres tab)

Either works identically for this app; picking the Vercel-native option
keeps everything in one dashboard.

**Option A — Vercel's own Storage tab:**
1. In your Vercel team dashboard → **Storage** → **Create Database** → **Postgres** → follow the prompts.
2. Once created, go to **.env.local** / **Quickstart** tab it shows you and copy the **pooled** connection string (usually the one Prisma/serverless guidance points at — look for `POSTGRES_PRISMA_URL` or one with `-pooler` in the hostname).

**Option B — Neon directly:**
1. Sign up at [neon.tech](https://neon.tech), create a project.
2. On the project dashboard, copy the **pooled connection string** (Neon shows both a direct and a pooled one — use the pooled one; it's pgbouncer-compatible, which is what a serverless function's frequent connect/disconnect cycle needs).

Either way, this is your `DATABASE_URL`.

## 2. File storage — Cloudflare R2

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage** → **Create bucket** (e.g. `p2p-prod`).
2. **R2 → Manage API Tokens → Create API Token** → read/write scoped to that bucket → copy the **Access Key ID** and **Secret Access Key**.
3. Note your **Account ID** (R2 dashboard sidebar) → endpoint is `https://<account-id>.r2.cloudflarestorage.com`.

You now have: `S3_BUCKET`, `S3_REGION=auto`, `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

## 3. Deploy the API as its own Vercel project

1. Vercel dashboard → **Add New… → Project** → import the same GitHub repo again (yes, a second project from the same repo — this is normal for monorepos).
2. **Root Directory** → `apps/api`.
3. Vercel should auto-detect this as a NestJS project (via `src/main.ts`) — no framework preset to set manually.
4. **Environment Variables** — add all of these:
   - `DATABASE_URL` → from step 1
   - `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` → from step 2
   - `AUTH_JWT_SECRET` → any long random string (generate one, e.g. `openssl rand -hex 32`)
   - `CRON_SECRET` → any long random string — Vercel automatically sends this as a Bearer token to your cron endpoint once it's set
   - `CORS_ALLOWED_ORIGINS` → your frontend's Vercel URL, e.g. `https://procurement-management-system-web.vercel.app`
   - Leave `NOTIFICATION_CENTER_API_URL` blank (unused stub, see CLAUDE.md)
5. Deploy. `apps/api/vercel.json`'s `buildCommand` (`npx prisma generate`) runs automatically — no other build config needed.
6. Note the resulting URL, e.g. `https://p2p-api-xxxx.vercel.app`.
7. **Run migrations once** — Vercel doesn't run `prisma migrate deploy` automatically the way the old Docker setup did. From your own machine, temporarily set `DATABASE_URL` to the same Neon/Vercel Postgres connection string and run:
   ```bash
   pnpm --filter api exec prisma migrate deploy
   ```
   Do this once after the first deploy, and again after any future schema change.
8. **Seed data is optional and demo-only.** Same caveat as before: `pnpm --filter api run db:seed` creates 7 users sharing the password `Passw0rd!`. Fine for a demo, never for real data. Run it the same way as migrations — point `DATABASE_URL` at the real database temporarily from your own machine.

## 4. Point the frontend at the real API

1. Go to the **frontend's** Vercel project (`procurement-management-system-web`) → **Settings → Environment Variables**.
2. Add `NEXT_PUBLIC_API_URL` = the API URL from step 3.6.
3. **Redeploy** the frontend (Deployments tab → ⋯ on the latest → Redeploy) — `NEXT_PUBLIC_*` variables are baked in at build time, so this won't take effect until a new build runs.

## 5. Verify

1. Visit the frontend URL — should redirect to `/login`.
2. Log in (seeded demo accounts, if you seeded: `admin@demo.p2p` / `Passw0rd!`).
3. If you still get "Failed to fetch": open the browser's Network tab, check what URL the failed request actually went to — it should be your API's `*.vercel.app` URL, not `localhost`. If it's still `localhost`, the frontend redeploy in step 4.3 hasn't happened yet or didn't pick up the new env var.

## What's different from the Render plan

- No Redis/Upstash needed at all.
- The escalation-scan job is a daily cron hit, not a 15-minute worker loop (see the note at the top).
- No Docker image, no `prisma migrate deploy` on every boot — migrations are a manual one-off step per schema change (step 3.7).
- Cold starts apply to the API on every plan tier, same free-tier reality as the Render plan had.
