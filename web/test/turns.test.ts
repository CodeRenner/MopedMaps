import { describe, expect, it } from 'vitest';
import { findRoute } from '../src/router/astar';
import { AccessFlag, type Chunk, type ChunkEdge, RoadClass, Surface } from '../src/router/chunk';
import { assembleGraph, type Graph } from '../src/router/graph';
import { turnAngle, turnCost } from '../src/router/turns';

const MOPED = { vmaxKmh: 45, drive: 'electric' } as const;
const D = 0.001; // ~111 m

function e(from: number, to: number, cls: number, over: Partial<ChunkEdge> = {}): ChunkEdge {
  return {
    fromIdx: from, toIdx: to, toTile: [0, 0], roadClass: cls,
    flags: AccessFlag.MOPED | AccessFlag.MOFA, maxspeedFwd: 30, maxspeedBwd: 30,
    surface: Surface.PAVED, lit: true, cycleway: false, signals: 0, lengthM: 111,
    curvatureDeg: 0, ascentM: 0, descentM: 0, risk: 50, shape: [], ...over,
  };
}
const chunk = (nodes: [number, number][], edges: ChunkEdge[]): Chunk => ({
  key: [0, 0], tileSize: 0.25, nodes, heights: nodes.map(() => null), edges,
});
/** Arc from node a to node b. */
function arc(g: Graph, a: number, b: number): number {
  for (let x = g.arcStart[a]!; x < g.arcStart[a + 1]!; x++) if (g.arcTarget[x] === b) return x;
  throw new Error(`no arc ${a}->${b}`);
}

describe('turn angles', () => {
  it('signed, right positive', () => {
    expect(turnAngle(0, 90)).toBe(90);
    expect(turnAngle(90, 0)).toBe(-90);
    expect(turnAngle(350, 10)).toBe(20);
    expect(turnAngle(0, 180)).toBe(180);
  });
});

describe('turn costs', () => {
  // Crossing at node 1: secondary W(0)->E(2), residential N(3) and S(4).
  const cross = assembleGraph([chunk(
    [[0, 0], [0, D], [0, 2 * D], [D, D], [-D, D]],
    [e(0, 1, RoadClass.SECONDARY), e(1, 2, RoadClass.SECONDARY), e(1, 3, RoadClass.RESIDENTIAL), e(1, 4, RoadClass.RESIDENTIAL)],
  )]);

  it('straight on is free; right cheaper than left; left adds risk', () => {
    const inA = arc(cross, 0, 1);
    expect(turnCost(cross, inA, arc(cross, 1, 2))).toEqual({ timeS: 0, riskPts: 0 });
    const right = turnCost(cross, inA, arc(cross, 1, 4)); // heading east, south is right
    const left = turnCost(cross, inA, arc(cross, 1, 3));
    expect(right.timeS).toBeGreaterThan(0);
    expect(left.timeS).toBeGreaterThan(right.timeS);
    expect(left.riskPts).toBeGreaterThan(0);
    expect(right.riskPts).toBe(0);
  });

  it('following a main road that bends is free (abknickende Vorfahrt), leaving it costs', () => {
    // Main road comes from W(0) to node 1 and bends north to 3; a residential road continues east to 2.
    const g = assembleGraph([chunk(
      [[0, 0], [0, D], [0, 2 * D], [D, D]],
      [e(0, 1, RoadClass.SECONDARY), e(1, 3, RoadClass.SECONDARY), e(1, 2, RoadClass.RESIDENTIAL)],
    )]);
    expect(turnCost(g, arc(g, 0, 1), arc(g, 1, 3)).timeS).toBe(0); // stays on the main road
    expect(turnCost(g, arc(g, 3, 1), arc(g, 1, 0)).timeS).toBe(0); // same the other way round
    expect(turnCost(g, arc(g, 3, 1), arc(g, 1, 2)).timeS).toBeGreaterThan(0); // turning off into the side road
  });

  it('a bend without alternatives (or a renamed road) is free', () => {
    const g = assembleGraph([chunk([[0, 0], [0, D], [D, D]], [e(0, 1, RoadClass.RESIDENTIAL), e(1, 2, RoadClass.TERTIARY)])]);
    expect(turnCost(g, arc(g, 0, 1), arc(g, 1, 2)).timeS).toBe(0);
  });

  it('"+ Abbiegen" prefers the main road with side streets over a zig-zag through side streets', () => {
    // Main road 0 -> 4 straight east (25 km/h) over junctions 1..3 with side streets: ~68 s.
    // Zig-zag: north 0 -> 5, east 5 -> 6, south 6 -> 4 on faster side streets (45 km/h): ~59 s plus two
    // real 90° turns at junctions 5 and 6 (each has a side street, so they are choices): 2 × 3 s × factor.
    const nodes: [number, number][] = [
      [0, 0], [0, D], [0, 2 * D], [0, 3 * D], [0, 4 * D], // 0..4 main road
      [D, 0], [D, 4 * D], // 5, 6 zig-zag corners
      [-D, D], [-D, 2 * D], [-D, 3 * D], // 7..9 side street stubs off the main road
      [2 * D, 0], [2 * D, 4 * D], // 10, 11 stubs at the zig-zag corners
    ];
    const fast = { maxspeedFwd: 60, maxspeedBwd: 60 };
    const slow = { maxspeedFwd: 25, maxspeedBwd: 25 };
    const edges = [
      e(0, 1, RoadClass.TERTIARY, slow), e(1, 2, RoadClass.TERTIARY, slow),
      e(2, 3, RoadClass.TERTIARY, slow), e(3, 4, RoadClass.TERTIARY, slow),
      e(1, 7, RoadClass.RESIDENTIAL), e(2, 8, RoadClass.RESIDENTIAL), e(3, 9, RoadClass.RESIDENTIAL),
      e(0, 5, RoadClass.UNCLASSIFIED, fast), e(5, 6, RoadClass.UNCLASSIFIED, { ...fast, lengthM: 444 }),
      e(6, 4, RoadClass.UNCLASSIFIED, fast),
      e(5, 10, RoadClass.UNCLASSIFIED), e(6, 11, RoadClass.UNCLASSIFIED),
    ];
    const g = assembleGraph([chunk(nodes, edges)]);
    const w = { time: 1, risk: 0, energy: 0 };
    const prefs = (junctions: number) => ({ fast: 1, traffic: 1, junctions, surface: 1, lighting: 1 });
    expect(findRoute(g, 0, 4, MOPED, { ...w, prefs: prefs(0.5) })!.nodes).toEqual([0, 5, 6, 4]);
    expect(findRoute(g, 0, 4, MOPED, { ...w, prefs: prefs(2) })!.nodes).toEqual([0, 1, 2, 3, 4]);
    // the side streets joining the main road cost nothing extra when driving straight on
    const straight = findRoute(g, 0, 4, MOPED, { ...w, prefs: prefs(2) })!;
    const noTurns = findRoute(g, 0, 4, MOPED, { ...w, prefs: prefs(0.5) })!;
    expect(straight.timeS).toBeGreaterThan(noTurns.timeS); // it is the slower road, chosen for fewer turns
  });
});
