import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'protocol',
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
