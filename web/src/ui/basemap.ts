/** Basemap fallback and storage persistence helpers (pure, testable). */

import type { StyleSpecification } from 'maplibre-gl';

/**
 * Minimal local style used when the basemap style cannot be fetched (first
 * visit offline, provider down). No sources and no glyphs, so it needs no
 * network; our own layers (area circle, route) are added on top as usual.
 */
export function fallbackStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'MopedMaps offline fallback',
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef0ec' } }],
  };
}

export interface PersistApi {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}

/**
 * Ask the browser to keep our storage (IndexedDB graph chunks) from being
 * evicted. Returns true/false, or undefined if unsupported. Never throws.
 */
export async function requestPersistence(storage: PersistApi | undefined): Promise<boolean | undefined> {
  try {
    if (!storage?.persist) return undefined;
    if (storage.persisted && (await storage.persisted())) return true;
    return await storage.persist();
  } catch {
    return undefined;
  }
}
