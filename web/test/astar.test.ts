import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findRoute } from '../src/router/astar';
import { AccessFlag, type Chunk, type ChunkEdge, decodeChunk, RoadClass, Surface } from '../src/router/chunk';
import { assembleGraph, nearestNode } from '../src/router/graph';
import { MinHeap } from '../src/router/heap';
import type { VehicleProfile } from '../src/router/profile';

const MOPED: VehicleProfile = { vmaxKmh: 45, drive: 'combustion' };
const MOFA: VehicleProfile = { vmaxKmh: 25, drive: 'electric' };
const FAST: VehicleProfile = { vmaxKmh: 100, drive: 'combustion' };
const fixture = (f: string) => decodeChunk(readFileSync(join(__dirname, 'fixtures', f)));

function e(from: number, to: number, lengthM: number, over: Partial<ChunkEdge> = {}): ChunkEdge {
  return {
    fromIdx: from, toIdx: to, toTile: [0, 0], roadClass: RoadClass.RESIDENTIAL,
    flags: AccessFlag.MOPED | AccessFlag.MOFA, maxspeedFwd: 30, maxspeedBwd: 30,
    surface: Surface.PAVED, lit: null, cycleway: false, signals: 0, lengthM,
    curvatureDeg: 0, ascentM: 0, descentM: 0, risk: 0, shape: [], ...over,
  };
}

/** Square A(0)-B(1)-D(3) and A-C(2)-D, ~1.1 km sides, plus motorway A-D. */
function square(): Chunk {
  return {
    key: [0, 0], tileSize: 0.25,
    nodes: [[0.0, 0.0], [0.0, 0.01], [0.01, 0.0], [0.01, 0.01]],
    edges: [
      e(0, 1, 1112), e(1, 3, 1112),
      e(0, 2, 1112, { signals: 3 }), e(2, 3, 1112),
      e(0, 3, 1600, { roadClass: RoadClass.MOTORWAY, maxspeedFwd: 130, maxspeedBwd: 130 }),
    ],
  };
}

describe('MinHeap', () => {
  it('pops in key order', () => {
    const h = new MinHeap();
    [5, 1, 4, 2, 3, 0].forEach((k) => h.push(k, k * 10));
    const out = [];
    while (h.size) out.push(h.pop());
    expect(out).toEqual([0, 10, 20, 30, 40, 50]);
  });
});

describe('findRoute (synthetic)', () => {
  const g = assembleGraph([square()]);

  it('avoids signals and the motorway for a moped', () => {
    const r = findRoute(g, 0, 3, MOPED)!;
    expect(r.nodes).toEqual([0, 1, 3]);
    expect(r.distanceM).toBe(2224);
    expect(r.timeS).toBeCloseTo(2224 / (30 / 3.6) + 2 * 2);
  });

  it('takes the motorway when vmax >= 60', () => {
    expect(findRoute(g, 0, 3, FAST)!.nodes).toEqual([0, 3]);
  });

  it('returns start-only route for start == target', () => {
    const r = findRoute(g, 2, 2, MOPED)!;
    expect(r.nodes).toEqual([2]);
    expect(r.cost).toBe(0);
  });
});

describe('findRoute (pipeline fixture)', () => {
  const g = assembleGraph([fixture('small_212_35.mmg')]);
  // OSM ids 1..5 -> global 0..4. 4-5 cycleway closed, 3-7-5 "Mofa frei".

  it('mofa may use the Mofa-frei cycleway, moped may not', () => {
    const mofa = findRoute(g, 0, 4, MOFA)!;
    expect(mofa.nodes).toEqual([0, 1, 2, 4]);
    expect(mofa.geometry).toHaveLength(5); // includes the shape point of way 103
    expect(findRoute(g, 0, 4, MOPED)).toBeNull();
  });

  it('route geometry is reversed when travelling against the edge', () => {
    const back = findRoute(g, 4, 2, MOFA)!;
    expect(back.geometry[1]![0]).toBeCloseTo(53.071);
    expect(back.geometry[back.geometry.length - 1]).toEqual([53.075, 8.82]);
  });
});

const BREMEN = join(__dirname, '..', '..', 'data', 'tiles-bremen');
describe.skipIf(!existsSync(BREMEN))('Bremen fixed start/destination pairs (local data)', () => {
  const chunks = (existsSync(BREMEN) ? readdirSync(BREMEN) : [])
    .filter((f) => f.endsWith('.mmg'))
    .map((f) => decodeChunk(readFileSync(join(BREMEN, f))));
  const g = assembleGraph(chunks);
  const at = (lat: number, lon: number) => nearestNode(g, lat, lon);

  const PAIRS: [string, [number, number], [number, number], number][] = [
    // name, start, destination, straight-line km
    ['Hauptbahnhof -> Vegesack', [53.0833, 8.8131], [53.1717, 8.6206], 15.9],
    ['Hauptbahnhof -> Universität', [53.0833, 8.8131], [53.1067, 8.8524], 3.7],
    ['Neustadt -> Hemelingen', [53.0703, 8.7953], [53.0563, 8.8890], 6.4],
  ];

  for (const [name, a, b, km] of PAIRS) {
    it(name, () => {
      const r = findRoute(g, at(...a), at(...b), MOPED);
      expect(r, name).not.toBeNull();
      const route = r!;
      expect(route.distanceM / 1000).toBeGreaterThan(km);
      expect(route.distanceM / 1000).toBeLessThan(km * 1.8);
      const avgKmh = route.distanceM / 1000 / (route.timeS / 3600);
      expect(avgKmh).toBeGreaterThan(15);
      expect(avgKmh).toBeLessThanOrEqual(45);
      for (const arc of route.arcs) {
        const edge = g.edges[g.arcEdge[arc]!]!;
        expect(edge.roadClass).not.toBe(RoadClass.MOTORWAY);
        expect(edge.flags & AccessFlag.MOTORROAD).toBe(0);
      }
      console.log(`${name}: ${(route.distanceM / 1000).toFixed(1)} km, ` +
        `${(route.timeS / 60).toFixed(1)} min, settled ${route.settled}/${g.nodeCount}`);
    });
  }

  it('A* is optimal (equals Dijkstra) and settles fewer nodes', () => {
    for (const [, a, b] of PAIRS) {
      const s = at(...a);
      const t = at(...b);
      const astar = findRoute(g, s, t, MOPED)!;
      const dijkstra = findRoute(g, s, t, MOPED, undefined, { heuristic: false })!;
      expect(astar.cost).toBeCloseTo(dijkstra.cost, 6);
      expect(astar.settled).toBeLessThan(dijkstra.settled);
    }
  });
});

describe('Dijkstra reference on synthetic graph', () => {
  it('A* and Dijkstra agree', () => {
    const g = assembleGraph([square()]);
    const a = findRoute(g, 0, 3, MOPED)!;
    const d = findRoute(g, 0, 3, MOPED, undefined, { heuristic: false })!;
    expect(a.cost).toBeCloseTo(d.cost);
  });
});
