import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: {
      '@ftu/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
      '@ftu/ui': fileURLToPath(new URL('./packages/ui/src/index.tsx', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/db/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
