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

  it('never uses openstreetmap.org tile servers', () => {
    expect(BASEMAP_STYLE_URL).not.toMatch(/tile\.openstreetmap\.org/);
  });
});
