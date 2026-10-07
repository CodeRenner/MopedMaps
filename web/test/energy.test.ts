import { describe, expect, it } from 'vitest';
import { findRoute } from '../src/router/astar';
import { AccessFlag, type Chunk, type ChunkEdge, RoadClass, Surface } from '../src/router/chunk';
import { edgeEnergy } from '../src/router/energy';
import { assembleGraph } from '../src/router/graph';
import { edgeCost, type VehicleProfile } from '../src/router/profile';

const EL: VehicleProfile = { vmaxKmh: 45, drive: 'electric' };
const ICE: VehicleProfile = { vmaxKmh: 45, drive: 'combustion' };

function e(over: Partial<ChunkEdge> = {}): ChunkEdge {
  return {
    fromIdx: 0, toIdx: 1, toTile: [0, 0], roadClass: RoadClass.SECONDARY,
    flags: AccessFlag.MOPED | AccessFlag.MOFA, maxspeedFwd: 50, maxspeedBwd: 50,
    surface: Surface.PAVED, lit: true, cycleway: false, signals: 0, lengthM: 1000,
    curvatureDeg: 0, ascentM: 0, descentM: 0, risk: 50, shape: [], ...over,
  };
}

describe('edgeEnergy', () => {
  it('flat cruise at 45 km/h gives realistic consumption', () => {
    const el = edgeEnergy(e(), true, EL);
    const ice = edgeEnergy(e(), true, ICE);
    expect(el.wheelWh).toBeGreaterThan(18);
    expect(el.wheelWh).toBeLessThan(24);
    expect(el.sourceWh).toBeGreaterThan(22); // ~26 Wh/km battery
    expect(el.sourceWh).toBeLessThan(32);
    expect(ice.fuelL * 100).toBeGreaterThan(1.5); // ~1.9 l/100 km
    expect(ice.fuelL * 100).toBeLessThan(2.5);
    expect(el.fuelL).toBe(0);
  });

  it('slower vehicles need less energy per km (aero ~ v²)', () => {
    expect(edgeEnergy(e(), true, { vmaxKmh: 25, drive: 'electric' }).wheelWh).toBeLessThan(
      edgeEnergy(e(), true, EL).wheelWh,
    );
  });

  it('uphill costs, downhill is direction-aware and never negative', () => {
    const hill = e({ ascentM: 20 });
    const upWh = edgeEnergy(hill, true, EL).wheelWh;
    const flatWh = edgeEnergy(e(), true, EL).wheelWh;
    expect(upWh - flatWh).toBeCloseTo((150 * 9.81 * 20) / 3600, 3); // ≈ 8.2 Wh
    const downWh = edgeEnergy(hill, false, EL).wheelWh;
    expect(downWh).toBeLessThan(flatWh);
    expect(downWh).toBeGreaterThanOrEqual(0);
    // a hump (up and down on one edge) costs at least the climb
    expect(edgeEnergy(e({ ascentM: 20, descentM: 20 }), true, EL).wheelWh).toBeGreaterThanOrEqual(upWh - flatWh);
    expect(edgeEnergy(e({ descentM: 200 }), true, ICE).wheelWh).toBe(0);
  });

  it('signals add stop-and-go energy, electric recovers part of it', () => {
    const s = e({ signals: 3 });
    const elExtra = edgeEnergy(s, true, EL).wheelWh - edgeEnergy(e(), true, EL).wheelWh;
    const iceExtra = edgeEnergy(s, true, ICE).wheelWh - edgeEnergy(e(), true, ICE).wheelWh;
    expect(elExtra).toBeGreaterThan(0);
    expect(iceExtra).toBeGreaterThan(elExtra);
    expect(edgeEnergy(s, true, ICE).fuelL).toBeGreaterThan(edgeEnergy(e(), true, ICE).fuelL);
  });

  it('enters the cost only with c > 0', () => {
    const hill = e({ ascentM: 30 });
    const w0 = { time: 1, risk: 0, energy: 0 };
    const w1 = { time: 1, risk: 0, energy: 1 };
    expect(edgeCost(hill, true, EL, w1) - edgeCost(hill, true, EL, w0)).toBeCloseTo(
      edgeEnergy(hill, true, EL).wheelWh,
    );
  });
});

describe('routing with energy', () => {
  /** A(0)->D(1): short route over an 80 m hump, or a longer flat detour via B(2). */
  const chunk: Chunk = {
    key: [0, 0], tileSize: 0.25,
    nodes: [[0, 0], [0, 0.01], [0.002, 0.005]],
    heights: [null, null, null],
    edges: [
      { ...e({ lengthM: 1112, ascentM: 80, descentM: 80 }), fromIdx: 0, toIdx: 1 },
      { ...e({ lengthM: 700 }), fromIdx: 0, toIdx: 2 },
      { ...e({ lengthM: 700 }), fromIdx: 2, toIdx: 1 },
    ],
  };
  const g = assembleGraph([chunk]);

  it('c = 0 takes the short hill, high c the flat detour; reports totals', () => {
    const fast = findRoute(g, 0, 1, EL, { time: 1, risk: 0, energy: 0 })!;
    const eco = findRoute(g, 0, 1, EL, { time: 1, risk: 0, energy: 20 })!;
    expect(fast.nodes).toEqual([0, 1]);
    expect(eco.nodes).toEqual([0, 2, 1]);
    expect(fast.ascentM).toBe(80);
    expect(eco.energyWh).toBeLessThan(fast.energyWh);
    const d = findRoute(g, 0, 1, EL, { time: 1, risk: 0, energy: 20 }, { heuristic: false })!;
    expect(eco.cost).toBeCloseTo(d.cost);
  });

  it('combustion reports litres', () => {
    const r = findRoute(g, 0, 1, ICE)!;
    expect(r.fuelL).toBeGreaterThan(0);
    expect(r.energyWh).toBeCloseTo(r.fuelL * 8900);
  });
});
