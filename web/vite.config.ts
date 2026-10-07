import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Files from public/ that the service worker should precache. */
const PUBLIC_PRECACHE = [
  'index.html',
  'manifest.webmanifest',
  'data/plz.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

/** Prepends the list of built assets to sw.js as a global the SW reads at startup. */
function precacheManifest(): Plugin {
  return {
    name: 'precache-manifest',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const built = Object.keys(bundle).filter(
        (f) => f !== 'sw.js' && !f.endsWith('.map') && !f.endsWith('.html'),
      );
      const list = JSON.stringify([...PUBLIC_PRECACHE, ...built].sort());
      const sw = bundle['sw.js'];
      if (!sw || sw.type !== 'chunk') throw new Error('sw.js chunk missing');
      if (!sw.code.includes('__PRECACHE_MANIFEST__')) throw new Error('sw.js does not read the manifest');
      sw.code = `self.__PRECACHE_MANIFEST__=${list};\n${sw.code}`;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [precacheManifest()],
  // MapLibre alone is ~1 MB minified (~280 KB gzip); everything else is small.
  build: {
    target: 'es2020',
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), sw: resolve(__dirname, 'src/sw/sw.ts') },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  worker: { format: 'es' },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
