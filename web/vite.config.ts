import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // MapLibre alone is ~1 MB minified (~280 KB gzip); everything else is small.
  build: { target: 'es2020', sourcemap: true, chunkSizeWarningLimit: 1200 },
  worker: { format: 'es' },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
