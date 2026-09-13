import { defineConfig } from 'vitest/config';

// Nonstandard suffixes keep this experiment out of default test/bench discovery.
export default defineConfig({
  test: {
    include: ['experiments/conquest/**/*.checks.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    benchmark: {
      include: ['experiments/conquest/**/*.perf.ts'],
      outputJson: 'bench-results/conquest/latest.json',
    },
  },
});
