import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // The local dev Postgres (Prisma's embedded PGlite, via `prisma dev`)
    // can't handle the connection load of every spec file's own
    // PrismaService opening a pool concurrently — serialize file execution
    // rather than lower pool sizes in production code. A real Postgres (CI,
    // `docker compose`) wouldn't need this, but it's harmless there too.
    fileParallelism: false,
  },
});
