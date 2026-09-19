import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'git',
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
