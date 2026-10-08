import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findRoute } from '../src/router/astar';
import { AccessFlag, type Chunk, type ChunkEdge, decodeChunk, RoadClass, Surface } from '../src/router/chunk';
import { assembleGraph, nearestNode } from '../src/router/graph';
import { edgeCost, edgeRisk, runtimeRiskPerKm, type VehicleProfile } from '../src/router/profile';

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
    heights: [null, null, null],
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
    expect(edgeRisk(edge)).toBe(100); // static score only
    const withVehicle = edgeRisk(edge, true, MOPED); // + 5 km/h over vmax at the urban factor
    expect(withVehicle).toBeCloseTo((50 + 5 * 0.3) * 2);
    const base = edgeCost(edge, true, MOPED, { time: 1, risk: 0, energy: 0 });
    expect(edgeCost(edge, true, MOPED, { time: 1, risk: 2, energy: 0 })).toBeCloseTo(base + 2 * withVehicle);
  });

  it('b = 0 picks the fast risky road, b > 0 the calm detour', () => {
    const g = assembleGraph([choice()]);
    const fast = findRoute(g, 0, 1, MOPED, { time: 1, risk: 0, energy: 0 })!;
    const safe = findRoute(g, 0, 1, MOPED, { time: 1, risk: 1, energy: 0 })!;
    expect(fast.nodes).toEqual([0, 1]);
    expect(safe.nodes).toEqual([0, 2, 1]);
    // static 180 + 25 km/h over vmax on a Bundesstraße (×3.5) + Bundesstraße surcharge 40
    expect(fast.riskAvg).toBeCloseTo(180 + 25 * 3.5 + 40);
    expect(safe.riskAvg).toBeCloseTo(35);
    expect(safe.timeS).toBeGreaterThan(fast.timeS);
  });

  it('runtime risk: speed differential by road class, calm 30 main roads, signal refund', () => {
    const MOFA: VehicleProfile = { vmaxKmh: 25, drive: 'electric' };
    const FAST: VehicleProfile = { vmaxKmh: 100, drive: 'combustion' };
    const road = (cls: number, limit: number, over: Partial<ChunkEdge> = {}) =>
      e(0, 1, 1000, { roadClass: cls, maxspeedFwd: limit, maxspeedBwd: limit, ...over });
    // 60 km/h: Bundesstraße > Landstraße, both above an urban 50 road
    const trunk60 = runtimeRiskPerKm(road(RoadClass.TRUNK, 60), true, MOPED);
    const tertiary60 = runtimeRiskPerKm(road(RoadClass.TERTIARY, 60), true, MOPED);
    const urban50 = runtimeRiskPerKm(road(RoadClass.RESIDENTIAL, 50), true, MOPED);
    expect(trunk60).toBe(15 * 4 + 50);
    expect(tertiary60).toBe(15 * 2);
    expect(urban50).toBeCloseTo(5 * 0.3);
    // a slower vehicle gets more, a vehicle as fast as the limit none from the differential
    expect(runtimeRiskPerKm(road(RoadClass.TERTIARY, 100), true, MOFA)).toBe(75 * 2);
    expect(runtimeRiskPerKm(road(RoadClass.TERTIARY, 100), true, FAST)).toBe(0);
    // 30 km/h main road: static class points are removed
    expect(runtimeRiskPerKm(road(RoadClass.PRIMARY, 30), true, MOPED)).toBe(-15);
    // signals: static points refunded (5 per signal per km)
    expect(runtimeRiskPerKm(road(RoadClass.RESIDENTIAL, 30, { signals: 2 }), true, MOPED)).toBe(-10);
    // never negative in total
    expect(edgeRisk(e(0, 1, 1000, { risk: 5, roadClass: RoadClass.PRIMARY, maxspeedFwd: 30 }), true, MOPED)).toBe(0);
    // unknown risk (old tiles without scores) stays 0
    expect(edgeRisk(road(RoadClass.TRUNK, 100, { risk: 0 }), true, MOPED)).toBe(0);
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

describe('traffic volume risk', async () => {
  const { dtvRiskPerKm } = await import('../src/router/profile');
  it('interpolates points by DTV, halves them in town, ignores calm 30 roads', () => {
    expect(dtvRiskPerKm(0, 100)).toBe(0); // unknown
    expect(dtvRiskPerKm(1500, 100)).toBe(0);
    expect(dtvRiskPerKm(5000, 100)).toBeCloseTo(10);
    expect(dtvRiskPerKm(8000, 100)).toBe(20);
    expect(dtvRiskPerKm(14000, 100)).toBeCloseTo(32.5);
    expect(dtvRiskPerKm(51320, 100)).toBe(45);
    expect(dtvRiskPerKm(8000, 50)).toBe(10);
    expect(dtvRiskPerKm(51320, 30)).toBe(0);
  });

  it('a busy Landstraße loses against a quiet parallel one at moderate safety', () => {
    const chunk: Chunk = {
      key: [0, 0], tileSize: 0.25,
      nodes: [[0, 0], [0, 0.02], [0.004, 0.01]],
      heights: [null, null, null],
      edges: [
        e(0, 1, 2224, { roadClass: RoadClass.SECONDARY, maxspeedFwd: 70, maxspeedBwd: 70, risk: 120, dtv: 15000 }),
        e(0, 2, 1150, { roadClass: RoadClass.TERTIARY, maxspeedFwd: 70, maxspeedBwd: 70, risk: 120, dtv: 1500 }),
        e(2, 1, 1150, { roadClass: RoadClass.TERTIARY, maxspeedFwd: 70, maxspeedBwd: 70, risk: 120, dtv: 1500 }),
      ],
    };
    const g = assembleGraph([chunk]);
    expect(findRoute(g, 0, 1, MOPED, { time: 1, risk: 0, energy: 0 })!.nodes).toEqual([0, 1]);
    expect(findRoute(g, 0, 1, MOPED, { time: 1, risk: 1, energy: 0 })!.nodes).toEqual([0, 2, 1]);
  });
});

describe('personal risk preferences', () => {
  const road = (cls: number, limit: number, over: Partial<ChunkEdge> = {}) =>
    e(0, 1, 1000, { roadClass: cls, maxspeedFwd: limit, maxspeedBwd: limit, ...over });
  const N = { fast: 1, traffic: 1, junctions: 1, surface: 1, lighting: 1 };

  it('scales each factor: fast roads, traffic, junctions, surface, lighting', () => {
    const trunk60 = road(RoadClass.TRUNK, 60);
    expect(runtimeRiskPerKm(trunk60, true, MOPED, { ...N, fast: 2 })).toBe(2 * (15 * 4 + 50));
    expect(runtimeRiskPerKm(trunk60, true, MOPED, { ...N, fast: 0.5 })).toBe(0.5 * (15 * 4 + 50));
    const busy = road(RoadClass.SECONDARY, 50, { dtv: 20000 }); // urban: 45 × 0.5, diff 5 × 0.3
    expect(runtimeRiskPerKm(busy, true, MOPED, { ...N, traffic: 2 }) - runtimeRiskPerKm(busy, true, MOPED)).toBeCloseTo(22.5);
    const cobbles = road(RoadClass.RESIDENTIAL, 30, { surface: Surface.COBBLE });
    expect(runtimeRiskPerKm(cobbles, true, MOPED, { ...N, surface: 2 }) - runtimeRiskPerKm(cobbles, true, MOPED)).toBe(15);
    const dark = road(RoadClass.RESIDENTIAL, 30, { lit: false });
    expect(runtimeRiskPerKm(dark, true, MOPED, { ...N, lighting: 0.5 }) - runtimeRiskPerKm(dark, true, MOPED)).toBe(-7.5);
    const short = e(0, 1, 50, { maxspeedFwd: 30, maxspeedBwd: 30 }); // dense junctions: capped 30 points
    expect(runtimeRiskPerKm(short, true, MOPED, { ...N, junctions: 2 }) - runtimeRiskPerKm(short, true, MOPED)).toBe(30);
  });

  it('"+ fast roads" leaves the risky road at a lower safety weight', () => {
    const g = assembleGraph([choice()]);
    const w = { time: 1, risk: 0.2, energy: 0 };
    expect(findRoute(g, 0, 1, MOPED, w)!.nodes).toEqual([0, 1]);
    expect(findRoute(g, 0, 1, MOPED, { ...w, prefs: { ...N, fast: 2 } })!.nodes).toEqual([0, 2, 1]);
    // the reported risk stays neutral (comparable between settings)
    const neutral = findRoute(g, 0, 1, MOPED, w)!;
    expect(neutral.riskAvg).toBeCloseTo(180 + 25 * 3.5 + 40);
  });
});
