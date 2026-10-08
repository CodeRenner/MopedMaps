import { describe, expect, it } from 'vitest';
import { findRoute } from '../src/router/astar';
import { AccessFlag, type Chunk, type ChunkEdge, RoadClass, Surface } from '../src/router/chunk';
import { assembleGraph } from '../src/router/graph';
import { climbWithHysteresis } from '../src/router/routeProfile';

describe('climbWithHysteresis', () => {
  it('counts a monotone climb in full', () => {
    expect(climbWithHysteresis([0, 1, 2, 3, 4, 10])).toBe(10);
  });
  it('ignores ripples below the threshold', () => {
    expect(climbWithHysteresis([5, 7, 5, 7, 5, 7, 5], 3)).toBe(0);
  });
  it('counts two real hills from their lows', () => {
    // 0 -> 20, down to 5, up to 30: 20 + 25
    expect(climbWithHysteresis([0, 10, 20, 12, 5, 18, 30, 29], 3)).toBe(45);
  });
  it('counts a final rise that reaches the threshold', () => {
    expect(climbWithHysteresis([10, 8, 11], 3)).toBe(3);
    expect(climbWithHysteresis([10, 8, 10], 3)).toBe(0);
  });
  it('skips unknown heights; empty or single height is 0', () => {
    expect(climbWithHysteresis([0, null, Number.NaN, 12])).toBe(12);
    expect(climbWithHysteresis([])).toBe(0);
    expect(climbWithHysteresis([null, 4])).toBe(0);
  });
});

function e(from: number, to: number, lengthM: number, over: Partial<ChunkEdge> = {}): ChunkEdge {
  return {
    fromIdx: from, toIdx: to, toTile: [0, 0], roadClass: RoadClass.RESIDENTIAL,
    flags: AccessFlag.MOPED | AccessFlag.MOFA, maxspeedFwd: 30, maxspeedBwd: 50,
    surface: Surface.PAVED, lit: null, cycleway: false, signals: 0, lengthM,
    curvatureDeg: 0, ascentM: 9, descentM: 0, risk: 0, shape: [], ...over,
  };
}

/** Chain 0-1-2-3 with noisy edge climbs (9 m each) but smooth node heights. */
function chain(heights: (number | null)[]): Chunk {
  return {
    key: [0, 0], tileSize: 0.25,
    nodes: [[0, 0], [0, 0.005], [0, 0.01], [0, 0.015]],
    heights,
    edges: [e(0, 1, 500), e(1, 2, 600, { maxspeedFwd: 70 }), e(2, 3, 400)],
  };
}

describe('route profile', () => {
  const EL = { vmaxKmh: 45, drive: 'electric' } as const;

  it('reports cumulative distance, node heights and capped speeds', () => {
    const r = findRoute(assembleGraph([chain([10, 11, 13, 20])]), 0, 3, EL)!;
    expect(r.profile.distM).toEqual([0, 500, 1100, 1500]);
    expect(r.profile.heightM).toEqual([10, 11, 13, 20]);
    expect(r.profile.speedKmh).toHaveLength(3);
    expect(r.profile.speedKmh[1]).toBeLessThanOrEqual(45);
    // posted limits (not capped at vmax) and where each node sits in the geometry
    expect(r.profile.limitKmh).toEqual([30, 70, 30]);
    expect(r.profile.geomIndex).toEqual([0, 1, 2, 3]);
    expect(r.ascentM).toBe(10);
  });

  it('reverse direction uses backward speeds and climbs nothing downhill', () => {
    const r = findRoute(assembleGraph([chain([10, 11, 13, 20])]), 3, 0, EL)!;
    expect(r.profile.heightM).toEqual([20, 13, 11, 10]);
    expect(r.ascentM).toBe(0);
  });

  it('falls back to edge climbs when heights are unknown (v1 tiles)', () => {
    const r = findRoute(assembleGraph([chain([null, null, null, null])]), 0, 3, EL)!;
    expect(r.profile.heightM).toEqual([null, null, null, null]);
    expect(r.ascentM).toBe(27);
  });
});
