import { describe, expect, it } from 'vitest';
import { AccessFlag, type Chunk, type ChunkEdge, RoadClass, Surface } from '../src/router/chunk';
import { assembleGraph } from '../src/router/graph';
import { routeSnapped } from '../src/router/snap';

const MOPED = { vmaxKmh: 45, drive: 'electric' } as const;
const OPEN = AccessFlag.MOPED | AccessFlag.MOFA;

function e(from: number, to: number, lengthM: number, flags = OPEN): ChunkEdge {
  return {
    fromIdx: from, toIdx: to, toTile: [0, 0], roadClass: RoadClass.UNCLASSIFIED,
    flags, maxspeedFwd: 30, maxspeedBwd: 30, surface: Surface.PAVED, lit: true, cycleway: false, signals: 0,
    lengthM, curvatureDeg: 0, ascentM: 0, descentM: 0, risk: 40, shape: [],
  };
}

/**
 * Public road 0-1-2 (east), a car park 3-4 behind a private entrance 1-3, and a
 * long footway 2-5. 0.001° ≈ 111 m.
 */
function town(): Chunk {
  return {
    key: [0, 0], tileSize: 0.25,
    nodes: [[0, 0], [0, 0.01], [0, 0.02], [0.001, 0.01], [0.001, 0.011], [0, 0.04]],
    heights: [null, null, null, null, null, null],
    edges: [
      e(0, 1, 1112), e(1, 2, 1112),
      e(1, 3, 111, 0), // private entrance: no access
      e(3, 4, 111), // car park aisle: usable, but cut off
      e(2, 5, 2224, 0), // footway
    ],
  };
}
const g = assembleGraph([town()]);
const at = (n: number): [number, number] => [g.lat[n]!, g.lon[n]!];

describe('snapping with fallback', () => {
  it('routes normally with no gap', () => {
    const r = routeSnapped(g, at(0), at(2), MOPED);
    expect(typeof r).toBe('object');
    if (typeof r === 'string') return;
    expect(r.startGapM).toBe(0);
    expect(r.targetGapM).toBe(0);
  });

  it('ends at the nearest reachable road when the target is in a cut-off car park', () => {
    const r = routeSnapped(g, at(0), at(4), MOPED);
    if (typeof r === 'string') throw new Error(r);
    expect(r.route.nodes[r.route.nodes.length - 1]).toBe(1); // the public road at the entrance
    expect(r.targetGapM).toBeGreaterThan(100);
    expect(r.targetGapM).toBeLessThan(300);
  });

  it('starts at the nearest reachable road when the start is in the car park', () => {
    const r = routeSnapped(g, at(4), at(2), MOPED);
    if (typeof r === 'string') throw new Error(r);
    expect(r.route.nodes[0]).toBe(1);
    expect(r.startGapM).toBeGreaterThan(100);
  });

  it('does not move a point far along a forbidden road', () => {
    expect(routeSnapped(g, at(0), at(5), MOPED)).toBe('unreachable'); // end of a 2 km footway
    expect(routeSnapped(g, at(0), [0.5, 0.5], MOPED)).toBe('target-off-network');
  });
});
