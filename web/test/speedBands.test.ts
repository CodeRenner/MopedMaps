import { describe, expect, it } from 'vitest';
import type { LatLon } from '../src/router/protocol';
import { bandFor, bandsAhead, speedBands } from '../src/ui/speedBands';

describe('speed bands', () => {
  it('classifies limits: <=50 none, <=70 orange, above red', () => {
    expect(bandFor(30)).toBeNull();
    expect(bandFor(50)).toBeNull();
    expect(bandFor(60)).toBe('orange');
    expect(bandFor(70)).toBe('orange');
    expect(bandFor(80)).toBe('red');
    expect(bandFor(100)).toBe('red');
  });

  it('merges consecutive edges of the same band and cuts the geometry per edge', () => {
    // 5 edges; edge 1 has a shape point (geometry index 2)
    const g: LatLon[] = [[0, 0], [0, 1], [0, 1.5], [0, 2], [0, 3], [0, 4], [0, 5]];
    const p = { limitKmh: [50, 60, 70, 100, 30], geomIndex: [0, 1, 3, 4, 5, 6], distM: [0, 100, 300, 400, 650, 700] };
    expect(speedBands(g, p)).toEqual([
      { band: 'orange', coords: [[0, 1], [0, 1.5], [0, 2], [0, 3]], lengthM: 300, startIdx: 1 },
      { band: 'red', coords: [[0, 3], [0, 4]], lengthM: 250, startIdx: 4 },
    ]);
    expect(speedBands(g, { limitKmh: [30, 50], geomIndex: [0, 1, 2], distM: [0, 10, 20] })).toEqual([]);
  });

  it('drops short sections (unmapped links get the class default and would flash red)', () => {
    const g: LatLon[] = [[0, 0], [0, 1], [0, 2]];
    expect(speedBands(g, { limitKmh: [100, 30], geomIndex: [0, 1, 2], distM: [0, 25, 400] })).toEqual([]);
  });

  it('keeps only the bands ahead of the rider, cut at the position', () => {
    const g: LatLon[] = [[0, 0], [0, 1], [0, 1.5], [0, 2], [0, 3], [0, 4], [0, 5]];
    const p = { limitKmh: [50, 60, 70, 100, 30], geomIndex: [0, 1, 3, 4, 5, 6], distM: [0, 100, 300, 400, 650, 700] };
    const bands = speedBands(g, p);
    // rider on segment 2 (index 2 -> 3), halfway
    const ahead = bandsAhead(bands, 2, [0, 1.75]);
    expect(ahead.map((b) => [b.band, b.coords])).toEqual([
      ['orange', [[0, 1.75], [0, 2], [0, 3]]],
      ['red', [[0, 3], [0, 4]]],
    ]);
    expect(bandsAhead(bands, 4, [0, 3.5]).map((b) => b.coords)).toEqual([[[0, 3.5], [0, 4]]]);
    expect(bandsAhead(bands, 5, [0, 4.5])).toEqual([]);
  });
});
