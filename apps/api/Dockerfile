# Multi-stage build for the NestJS API. Built from the monorepo root
# (see the `docker build -f apps/api/Dockerfile .` note in
# docs/deploy-github-pages-render.md) since pnpm workspaces need the root
# lockfile/workspace file even though only apps/api ends up in the image.
FROM node:24-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
# Prisma's generated client (src/generated/prisma) is gitignored — it has
# to exist before `nest build` compiles anything that imports it.
RUN pnpm --filter api run db:generate
RUN pnpm --filter api run build
# Copies apps/api's dist/ + a pruned, production-only node_modules into a
# single self-contained directory — pnpm's own recommended pattern for
# turning one workspace package into a Docker image (avoids shipping every
# other app/package's dependencies).
RUN pnpm --filter api deploy --prod /prod/api

FROM base AS runtime
# Prisma's query/schema engines need libssl even when driver adapters
# (@prisma/adapter-pg here) handle actual queries — `migrate deploy` still
# shells out to a Prisma engine binary that needs it.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /prod/api ./
ENV NODE_ENV=production
EXPOSE 3001
# Applies any pending migrations, then starts the API — safe to run on
# every boot since `prisma migrate deploy` is a no-op when nothing's
# pending, and this is the one place that's guaranteed to run before the
# app starts serving traffic on a fresh deploy.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
