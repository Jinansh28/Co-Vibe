import { defineConfig } from 'vitest/config';

/**
 * Shared Vitest options applied when running from the monorepo root.
 * Per-app/package environments and include globs live in each project's
 * `vitest.config.ts` and are composed via `vitest.workspace.ts`.
 */
export default defineConfig({
  test: {
    globals: true,
    reporters: ['default'],
    fileParallelism: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['packages/protocol/src/**/*.ts', 'packages/security/src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.test.ts', '**/*.test.tsx'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
