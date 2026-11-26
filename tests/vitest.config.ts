import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'security-regressions',
    globals: true,
    environment: 'node',
    include: ['security/**/*.test.ts'],
  },
});
