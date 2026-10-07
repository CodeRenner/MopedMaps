/** Which graph tiles intersect the circle around the chosen location. Pure. */

import type { Manifest, ManifestTile } from '../data/manifest';
import { haversineM } from '../router/geo';
import { type TileKey, tileName } from '../router/chunk';

const KM_PER_DEG_LAT = 111.195;

/**
 * All grid tiles whose rectangle comes within `radiusKm` of (lat, lon).
 * Uses the closest point of each rectangle (clamped lat/lon), which is
 * accurate to well under a percent for tiles this small.
 */
export function tilesInRadius(lat: number, lon: number, radiusKm: number, size: number): TileKey[] {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const maxAbsLat = Math.min(89, Math.abs(lat) + dLat);
  const dLon = radiusKm / (KM_PER_DEG_LAT * Math.cos((maxAbsLat * Math.PI) / 180));
  const iy0 = Math.floor((lat - dLat) / size);
  const iy1 = Math.floor((lat + dLat) / size);
  const ix0 = Math.floor((lon - dLon) / size);
  const ix1 = Math.floor((lon + dLon) / size);
  const r = radiusKm * 1000;
  const out: TileKey[] = [];
  for (let iy = iy0; iy <= iy1; iy++) {
    const cLat = Math.min(Math.max(lat, iy * size), (iy + 1) * size);
    for (let ix = ix0; ix <= ix1; ix++) {
      const cLon = Math.min(Math.max(lon, ix * size), (ix + 1) * size);
      if (haversineM(lat, lon, cLat, cLon) <= r) out.push([ix, iy]);
    }
  }
  return out;
}

export interface TilePlan {
  /** Existing tiles to download, nearest first. */
  files: string[];
  totalBytes: number;
  totalGzipBytes: number;
}

/** Tiles in radius that exist in the build, nearest first, with size totals. */
export function planTiles(m: Manifest, lat: number, lon: number, radiusKm: number): TilePlan {
  const size = m.tile_size_deg;
  const keyed = tilesInRadius(lat, lon, radiusKm, size)
    .map((k) => ({ name: tileName(k), t: m.tiles[tileName(k)] }))
    .filter((x): x is { name: string; t: ManifestTile } => x.t !== undefined);
  const centre = (t: ManifestTile) =>
    haversineM(lat, lon, (t.iy + 0.5) * size, (t.ix + 0.5) * size);
  keyed.sort((a, b) => centre(a.t) - centre(b.t));
  return {
    files: keyed.map((x) => x.name),
    totalBytes: keyed.reduce((s, x) => s + x.t.bytes, 0),
    totalGzipBytes: keyed.reduce((s, x) => s + x.t.gzip_bytes, 0),
  };
}
