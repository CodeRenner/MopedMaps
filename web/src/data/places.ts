/**
 * Offline-search data: the places tiles (pipeline places.py) of the loaded
 * area, cached in their own IndexedDB store so graph pruning keeps them.
 */

import { SearchIndex, type PlacesTile } from '../search/index';
import { loadChunks } from './loader';
import type { ChunkStore } from './store';

export interface PlacesIndexFile {
  format: 'places';
  version: 1;
  built_at: string;
  tiles: Record<string, { bytes: number; gzip_bytes: number }>;
}

const INDEX_NAME = 'places/index.json';
const INDEX_BUILD = 'index';

export interface PlacesDeps {
  baseUrl: string;
  store: ChunkStore;
  fetchFn?: typeof fetch;
}

/** Latest index from the network, or the cached copy when offline; null if there is none. */
async function placesIndex(d: PlacesDeps): Promise<PlacesIndexFile | null> {
  const f = d.fetchFn ?? fetch;
  try {
    const res = await f(`${d.baseUrl}/${INDEX_NAME}`);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const parsed = JSON.parse(new TextDecoder().decode(buf)) as PlacesIndexFile;
      if (parsed.format === 'places') {
        await d.store.put(INDEX_BUILD, INDEX_NAME, buf).catch(() => undefined);
        return parsed;
      }
    }
  } catch {
    // offline: fall through to the cached copy
  }
  const cached = await d.store.get(INDEX_BUILD, INDEX_NAME).catch(() => undefined);
  return cached ? (JSON.parse(new TextDecoder().decode(cached)) as PlacesIndexFile) : null;
}

/** Graph tile file names ("212_35.mmg") -> search index over their places tiles. */
export async function loadSearchData(graphFiles: string[], d: PlacesDeps): Promise<SearchIndex | null> {
  const index = await placesIndex(d);
  if (!index) return null;
  const names = graphFiles
    .map((f) => f.replace(/\.mmg$/, '.json'))
    .filter((f) => f in index.tiles)
    .map((f) => `places/${f}`);
  const buildId = `places:${index.built_at}`;
  const buffers = await loadChunks(names, {
    baseUrl: d.baseUrl,
    buildId,
    store: d.store,
    ...(d.fetchFn && { fetchFn: d.fetchFn }),
  });
  const search = new SearchIndex();
  const text = new TextDecoder();
  for (const b of buffers) search.add(JSON.parse(text.decode(b)) as PlacesTile);
  // keep the index row, drop tiles of older builds
  await d.store.prune(buildId).catch(() => 0);
  await d.store.put(INDEX_BUILD, INDEX_NAME, new TextEncoder().encode(JSON.stringify(index)).buffer as ArrayBuffer).catch(() => undefined);
  return search;
}
