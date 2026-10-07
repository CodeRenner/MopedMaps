import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findRoute } from '../src/router/astar';
import { AccessFlag, type Chunk, type ChunkEdge, decodeChunk, RoadClass, Surface } from '../src/router/chunk';
import { assembleGraph, nearestNode } from '../src/router/graph';
import { edgeCost, edgeRisk, type VehicleProfile } from '../src/router/profile';

const MOPED: VehicleProfile = { vmaxKmh: 45, drive: 'combustion' };

function e(from: number, to: number, lengthM: number, over: Partial<ChunkEdge> = {}): ChunkEdge {
  return {
    fromIdx: from, toIdx: to, toTile: [0, 0], roadClass: RoadClass.RESIDENTIAL,
    flags: AccessFlag.MOPED | AccessFlag.MOFA, maxspeedFwd: 50, maxspeedBwd: 50,
    surface: Surface.PAVED, lit: true, cycleway: false, signals: 0, lengthM,
    curvatureDeg: 0, ascentM: 0, descentM: 0, risk: 40, shape: [], ...over,
  };
}

/** A(0) -> D(1) directly on a risky primary road, or via B(2) on calm side streets (longer). */
function choice(): Chunk {
  return {
    key: [0, 0], tileSize: 0.25,
    nodes: [[0, 0], [0, 0.02], [0.005, 0.01]],
    edges: [
      e(0, 1, 2224, { roadClass: RoadClass.PRIMARY, maxspeedFwd: 70, maxspeedBwd: 70, risk: 180 }),
      e(0, 2, 1300, { maxspeedFwd: 30, maxspeedBwd: 30, risk: 35 }),
      e(2, 1, 1300, { maxspeedFwd: 30, maxspeedBwd: 30, risk: 35 }),
    ],
  };
}

describe('risk in cost', () => {
  it('edgeRisk is score × km and adds b·risk to the cost', () => {
    const edge = e(0, 1, 2000, { risk: 50 });
    expect(edgeRisk(edge)).toBe(100);
    const base = edgeCost(edge, true, MOPED, { time: 1, risk: 0, energy: 0 });
    expect(edgeCost(edge, true, MOPED, { time: 1, risk: 2, energy: 0 })).toBeCloseTo(base + 200);
  });

  it('b = 0 picks the fast risky road, b > 0 the calm detour', () => {
    const g = assembleGraph([choice()]);
    const fast = findRoute(g, 0, 1, MOPED, { time: 1, risk: 0, energy: 0 })!;
    const safe = findRoute(g, 0, 1, MOPED, { time: 1, risk: 1, energy: 0 })!;
    expect(fast.nodes).toEqual([0, 1]);
    expect(safe.nodes).toEqual([0, 2, 1]);
    expect(fast.riskAvg).toBeCloseTo(180);
    expect(safe.riskAvg).toBeCloseTo(35);
    expect(safe.timeS).toBeGreaterThan(fast.timeS);
  });

  it('A* equals Dijkstra with risk weight', () => {
    const g = assembleGraph([choice()]);
    const w = { time: 1, risk: 1.5, energy: 0 };
    expect(findRoute(g, 0, 1, MOPED, w)!.cost).toBeCloseTo(
      findRoute(g, 0, 1, MOPED, w, { heuristic: false })!.cost,
    );
  });
});

const BREMEN = join(__dirname, '..', '..', 'data', 'tiles-bremen');
describe.skipIf(!existsSync(BREMEN))('Bremen with risk (local data)', () => {
  const g = assembleGraph(
    (existsSync(BREMEN) ? readdirSync(BREMEN) : []).filter((f) => f.endsWith('.mmg')).map((f) => decodeChunk(readFileSync(join(BREMEN, f)))),
  );
  const s = nearestNode(g, 53.0833, 8.8131);
  const t = nearestNode(g, 53.1717, 8.6206);

  it('higher b lowers average risk and stays optimal', () => {
    const results = [0, 0.5, 2].map((b) => {
      const w = { time: 1, risk: b, energy: 0 };
      const r = findRoute(g, s, t, MOPED, w)!;
      const d = findRoute(g, s, t, MOPED, w, { heuristic: false })!;
      expect(r.cost).toBeCloseTo(d.cost, 6);
      console.log(`b=${b}: ${(r.distanceM / 1000).toFixed(1)} km, ${(r.timeS / 60).toFixed(1)} min, risk ${r.riskAvg.toFixed(0)}`);
      return r;
    });
    expect(results[2]!.riskAvg).toBeLessThanOrEqual(results[0]!.riskAvg);
    expect(results[2]!.timeS).toBeGreaterThanOrEqual(results[0]!.timeS);
  });
});
