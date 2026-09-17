import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'runtime',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
