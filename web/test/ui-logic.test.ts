import { describe, expect, it } from 'vitest';
import { AreaError } from '../src/data/area';
import { circleBounds, circlePolygon } from '../src/location/circle';
import { haversineM } from '../src/router/geo';
import { areaErrorKey, downloadMb, routeErrorKey, routeSummaryParams } from '../src/ui/messages';

describe('circlePolygon', () => {
  it('is closed and every vertex is at the radius', () => {
    const ring = circlePolygon(53.08, 8.8, 75).geometry.coordinates[0]!;
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[64]);
    for (const [lon, lat] of ring) {
      expect(haversineM(53.08, 8.8, lat!, lon!)).toBeCloseTo(75_000, -1);
    }
  });

  it('bounds are wider in longitude than latitude in Germany', () => {
    const [[w, s], [e, n]] = circleBounds(53.08, 8.8, 75);
    expect(n - s).toBeCloseTo(1.349, 2);
    expect(e - w).toBeGreaterThan(n - s);
  });
});

describe('messages', () => {
  it('maps errors to i18n keys', () => {
    expect(areaErrorKey(new AreaError('unknown-plz', 'x'))).toBe('area.error.unknown-plz');
    expect(areaErrorKey(new TypeError('fetch failed'))).toBe('area.error.network');
    expect(routeErrorKey('unreachable')).toBe('route.error.unreachable');
  });

  it('formats sizes and summaries per locale', () => {
    expect(downloadMb('de', 12_345_678)).toBe('12,3');
    expect(downloadMb('en', 1_000)).toBe('0.1');
    expect(routeSummaryParams('de', 19_940, 2664)).toEqual({ km: '19,9', min: 44 });
    expect(routeSummaryParams('en', 100, 5)).toEqual({ km: '0.1', min: 1 });
  });
});
