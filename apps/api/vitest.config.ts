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
    // The local dev MySQL (docker-compose.yml) can't handle the connection
    // load of every spec file's own PrismaService opening a pool
    // concurrently — serialize file execution rather than lower pool sizes
    // in production code.
    fileParallelism: false,
  },
});
