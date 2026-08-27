import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['diagnostics/run-diagnostics.ts'],
    env: {
      DIAGNOSTICS: '1',
    },
  },
});
