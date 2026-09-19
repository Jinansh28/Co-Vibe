import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    name: 'api',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    alias: {
      'cloudflare:workers': resolve(__dirname, './tests/mocks/cloudflare-workers.ts'),
    },
  },
});
