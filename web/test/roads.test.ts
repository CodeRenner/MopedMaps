import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RouterResponse } from '../src/router/protocol';
import { maxClassForZoom } from '../src/router/roads';
import { RouterService } from '../src/router/service';
import { roadsToGeoJson } from '../src/ui/roadsLayer';

const buf = (f: string): ArrayBuffer => {
  const b = readFileSync(join(__dirname, 'fixtures', f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
type Roads = Extract<RouterResponse, { type: 'roads' }>['roads'];

describe('offline road lines', () => {
  const s = new RouterService();
  const roads = (bbox: [number, number, number, number], maxClass = 8, limit = 1000): Roads => {
    const r = s.handle({ type: 'roads', id: 9, bbox, maxClass, limit });
    expect(r.type).toBe('roads');
    return (r as Extract<RouterResponse, { type: 'roads' }>).roads;
  };

  it('is empty before an area is loaded', () => {
    expect(roads([53, 8.7, 53.2, 8.9]).classes.length).toBe(0);
  });

  it('returns the edges inside the box with their geometry', () => {
    s.handle({ type: 'load', id: 1, chunks: [buf('small_212_35.mmg')] });
    const all = roads([53, 8.7, 53.2, 8.9], 255);
    expect(all.classes.length).toBe(4);
    expect(roads([53, 8.7, 53.2, 8.9], 8).classes.length).toBe(3); // the path is left out
    expect(all.offsets[4]).toBe(all.coords.length / 2);
    expect(all.truncated).toBe(false);
    expect(roads([54, 8.7, 54.1, 8.9]).classes.length).toBe(0); // elsewhere
    const one = roads([53, 8.7, 53.2, 8.9], 255, 1);
    expect([one.classes.length, one.truncated]).toEqual([1, true]);

    const fc = roadsToGeoJson(all);
    expect(fc.features).toHaveLength(4);
    const [lon, lat] = fc.features[0]!.geometry.coordinates[0]!;
    expect(lat).toBeGreaterThan(53); // lon/lat order for GeoJSON
    expect(lon).toBeLessThan(9);
  });

  it('draws fewer classes when zoomed out', () => {
    expect(maxClassForZoom(8)).toBeLessThan(maxClassForZoom(12));
    expect(maxClassForZoom(16)).toBe(8);
  });
});
