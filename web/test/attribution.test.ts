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

  it('never uses openstreetmap.org tile servers', () => {
    expect(BASEMAP_STYLE_URL).not.toMatch(/tile\.openstreetmap\.org/);
  });
});
