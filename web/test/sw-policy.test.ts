import { describe, expect, it } from 'vitest';
import { hashList, strategyFor } from '../src/sw/policy';

const scope = new URL('https://example.test/app/');
const pre = new Set(['index.html', 'data/plz.json', 'assets/index-abc.js']);
const s = (u: string, nav = false) => strategyFor(new URL(u), scope, pre, nav);

describe('service worker strategy', () => {
  it('serves the app shell from the precache', () => {
    expect(s('https://example.test/app/', true)).toBe('precache');
    expect(s('https://example.test/app/assets/index-abc.js')).toBe('precache');
    expect(s('https://example.test/app/data/plz.json')).toBe('precache');
  });

  it('graph: manifest network-first, chunks left to IndexedDB', () => {
    expect(s('https://example.test/app/graph/manifest.json')).toBe('network-first');
    expect(s('https://example.test/app/graph/212_35.mmg')).toBe('passthrough');
    expect(s('https://example.test/app/graph/places/index.json')).toBe('network-first');
    expect(s('https://example.test/app/graph/places/212_35.json')).toBe('passthrough');
  });

  it('caches only small basemap assets, never tiles', () => {
    expect(s('https://tiles.openfreemap.org/styles/liberty')).toBe('stale-while-revalidate');
    expect(s('https://tiles.openfreemap.org/fonts/Noto%20Sans/0-255.pbf')).toBe('stale-while-revalidate');
    expect(s('https://tiles.openfreemap.org/sprites/ofm_f384/ofm.json')).toBe('stale-while-revalidate');
    expect(s('https://tiles.openfreemap.org/planet/20261001/10/543/335.pbf')).toBe('passthrough');
  });

  it('ignores other origins and unknown same-origin files', () => {
    expect(s('https://other.test/app/x.js')).toBe('passthrough');
    expect(s('https://example.test/app/unknown.txt')).toBe('passthrough');
    expect(s('https://example.test/elsewhere/index.html')).toBe('passthrough');
  });
});

describe('cache versioning', () => {
  it('changes when an asset hash changes, even with equal length', () => {
    const a = hashList(['assets/main-aaaa.js', 'index.html']);
    const b = hashList(['assets/main-aaab.js', 'index.html']);
    expect(a).not.toBe(b);
    expect(hashList(['x'])).toBe(hashList(['x']));
  });
});

describe('closures file', () => {
  it('is network-first (fresh daily, still offline)', async () => {
    const { strategyFor } = await import('../src/sw/policy');
    const scope = new URL('https://x.test/');
    expect(strategyFor(new URL('https://x.test/closures.json'), scope, new Set(), false)).toBe('network-first');
  });
});
