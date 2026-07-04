import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Offline unit + security suites are fast; the live suite overrides this
    // per-file (it hits the real conversion pipeline).
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
