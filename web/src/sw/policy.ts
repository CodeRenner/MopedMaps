/**
 * Caching strategy per request (pure, no imports, so it bundles into sw.js).
 *
 * - precache: app shell + PLZ table, cached at install, served cache-first
 * - network-first: graph manifest and the daily closures file (must see
 *   new versions, still work offline)
 * - stale-while-revalidate: basemap style JSON, sprites and glyphs (small;
 *   needed so the map can start offline)
 * - passthrough: graph chunks (already in IndexedDB) and basemap tiles
 *   (no bulk caching of a third-party tile service)
 */

export type Strategy = 'precache' | 'network-first' | 'stale-while-revalidate' | 'passthrough';

export const BASEMAP_HOST = 'tiles.openfreemap.org';
const BASEMAP_SMALL_ASSETS = /^\/(styles|sprites|fonts)\//;

export function strategyFor(
  url: URL,
  scope: URL,
  precache: ReadonlySet<string>,
  isNavigation: boolean,
): Strategy {
  if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname)) {
    const rel = url.pathname.slice(scope.pathname.length);
    if (isNavigation) return 'precache'; // served from cached index.html
    if (rel === 'graph/manifest.json' || rel === 'closures.json') return 'network-first';
    if (rel.startsWith('graph/')) return 'passthrough';
    if (precache.has(rel)) return 'precache';
    return 'passthrough';
  }
  if (url.hostname === BASEMAP_HOST && BASEMAP_SMALL_ASSETS.test(url.pathname)) {
    return 'stale-while-revalidate';
  }
  return 'passthrough';
}

/** Stable short hash (FNV-1a, 32 bit) used to version the shell cache. */
export function hashList(items: readonly string[]): string {
  let h = 0x811c9dc5;
  for (const ch of items.join('\n')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
