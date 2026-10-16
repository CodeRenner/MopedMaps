import { describe, expect, it } from 'vitest';
import { BASEMAP_STYLE_URL } from '../src/config';
import { appAttributions } from '../src/ui/attribution';

describe('compliance', () => {
  it('shows OSM and GeoNames attribution', () => {
    const all = appAttributions().join(' ');
    expect(all).toContain('OpenStreetMap contributors');
    expect(all).toContain('ODbL');
    expect(all).toContain('GeoNames');
    expect(all).toContain('CC BY 4.0');
  });

  it('names every closures source', () => {
    const all = appAttributions().join(' ');
    for (const src of ['MobiData BW', 'Freiburg', 'Sachsen', 'Brandenburg', 'VIZ Berlin']) expect(all).toContain(src);
  });

  it('names every traffic-volume source', () => {
    const all = appAttributions().join(' ');
    for (const src of ['Verkehrsministerium BW', 'BAYSIS', 'LASuV Sachsen', 'LS Brandenburg', 'Berlin', 'Hamburg'])
      expect(all).toContain(src);
  });

  it('includes the app version', () => {
    expect(appAttributions('2026-10-16 · e4aa6f8').slice(-1)[0]).toBe('MopedMaps 2026-10-16 · e4aa6f8');
    expect(appAttributions().slice(-1)[0]).toMatch(/^MopedMaps (\d{4}-\d{2}-\d{2} · [0-9a-f]{7,}|dev)$/);
  });

  it('never uses openstreetmap.org tile servers', () => {
    expect(BASEMAP_STYLE_URL).not.toMatch(/tile\.openstreetmap\.org/);
  });
});
