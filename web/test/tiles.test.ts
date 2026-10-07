import { describe, expect, it } from 'vitest';
import { buildId, type Manifest, parseManifest } from '../src/data/manifest';
import { planTiles, tilesInRadius } from '../src/location/tiles';
import { haversineM } from '../src/router/geo';

const S = 0.25;

describe('tilesInRadius', () => {
  it('always contains the centre tile', () => {
    expect(tilesInRadius(53.07, 8.81, 1, S)).toEqual([[35, 212]]);
  });

  it('75 km around Bremen touches a plausible number of tiles', () => {
    const t = tilesInRadius(53.08, 8.8, 75, S);
    // circle area / tile area ≈ π·75² / (27.8·16.7) ≈ 38, plus border tiles
    expect(t.length).toBeGreaterThan(40);
    expect(t.length).toBeLessThan(90);
  });

  it('includes every tile containing a point within the radius and nothing far away', () => {
    const lat = 51.5;
    const lon = 7.5;
    const r = 30;
    const tiles = new Set(tilesInRadius(lat, lon, r, S).map((k) => k.join(',')));
    for (let i = 0; i < 2000; i++) {
      const a = Math.random() * 2 * Math.PI;
      const d = Math.sqrt(Math.random()) * r * 0.999;
      const pLat = lat + (d / 111.195) * Math.cos(a);
      const pLon = lon + (d / (111.195 * Math.cos((pLat * Math.PI) / 180))) * Math.sin(a);
      if (haversineM(lat, lon, pLat, pLon) > r * 1000) continue;
      expect(tiles.has(`${Math.floor(pLon / S)},${Math.floor(pLat / S)}`)).toBe(true);
    }
    for (const key of tiles) {
      const [ix, iy] = key.split(',').map(Number) as [number, number];
      const cLat = Math.min(Math.max(lat, iy * S), (iy + 1) * S);
      const cLon = Math.min(Math.max(lon, ix * S), (ix + 1) * S);
      expect(haversineM(lat, lon, cLat, cLon)).toBeLessThanOrEqual(r * 1000);
    }
  });

  it('grows monotonically with the radius', () => {
    const sizes = [25, 50, 75, 100].map((r) => tilesInRadius(48.14, 11.57, r, S).length);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });
});

const manifest: Manifest = {
  format: 'mmg', version: 1, tile_size_deg: 0.25, built_at: '2026-10-06T00:00:00+00:00',
  source: 'bremen-latest.osm.pbf', attribution: '© OpenStreetMap contributors', totals: {},
  tiles: {
    '212_35.mmg': { ix: 35, iy: 212, bytes: 1000, gzip_bytes: 400, nodes: 1, edges: 1 },
    '212_34.mmg': { ix: 34, iy: 212, bytes: 500, gzip_bytes: 200, nodes: 1, edges: 1 },
    '230_60.mmg': { ix: 60, iy: 230, bytes: 9999, gzip_bytes: 9999, nodes: 1, edges: 1 },
  },
};

describe('planTiles', () => {
  it('keeps only existing tiles in radius, nearest first, with totals', () => {
    const p = planTiles(manifest, 53.1, 8.8, 30);
    expect(p.files).toEqual(['212_35.mmg', '212_34.mmg']);
    expect(p.totalBytes).toBe(1500);
    expect(p.totalGzipBytes).toBe(600);
  });
});

describe('manifest', () => {
  it('parses and rejects', () => {
    expect(parseManifest(JSON.parse(JSON.stringify(manifest))).tiles['212_35.mmg']?.ix).toBe(35);
    expect(() => parseManifest({ format: 'x' })).toThrow();
    expect(buildId(manifest)).toBe('1:2026-10-06T00:00:00+00:00');
  });
});
