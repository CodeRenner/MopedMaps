import { describe, expect, it } from 'vitest';
import { AccessFlag, type ChunkEdge, RoadClass, Surface } from '../src/router/chunk';
import {
  canUse,
  edgeCost,
  speedKmh,
  travelTimeS,
  validateProfile,
  type VehicleProfile,
} from '../src/router/profile';

const MOPED: VehicleProfile = { vmaxKmh: 45, drive: 'combustion' };
const MOFA: VehicleProfile = { vmaxKmh: 25, drive: 'electric' };
const BIKE125: VehicleProfile = { vmaxKmh: 100, drive: 'combustion' };

function edge(over: Partial<ChunkEdge> = {}): ChunkEdge {
  return {
    fromIdx: 0, toIdx: 1, toTile: [0, 0], roadClass: RoadClass.RESIDENTIAL,
    flags: AccessFlag.MOPED | AccessFlag.MOFA, maxspeedFwd: null, maxspeedBwd: null,
    surface: Surface.PAVED, lit: null, cycleway: false, signals: 0, lengthM: 1000,
    curvatureDeg: 0, ascentM: 0, descentM: 0, risk: 0, shape: [], ...over,
  };
}

describe('access', () => {
  it('excludes motorways and motorroads below 60 km/h', () => {
    const mw = edge({ roadClass: RoadClass.MOTORWAY });
    const kfs = edge({ roadClass: RoadClass.PRIMARY, flags: AccessFlag.MOPED | AccessFlag.MOTORROAD });
    expect(canUse(mw, MOPED)).toBe(false);
    expect(canUse(kfs, MOPED)).toBe(false);
    expect(canUse(mw, BIKE125)).toBe(true);
    expect(canUse(kfs, BIKE125)).toBe(true);
  });

  it('uses mofa rules up to 25 km/h', () => {
    const mofaFrei = edge({ roadClass: RoadClass.CYCLEWAY, flags: AccessFlag.MOFA });
    expect(canUse(mofaFrei, MOFA)).toBe(true);
    expect(canUse(mofaFrei, MOPED)).toBe(false);
  });

  it('validates vmax', () => {
    expect(() => validateProfile({ vmaxKmh: 0, drive: 'electric' })).toThrow();
    expect(validateProfile(MOPED)).toBe(MOPED);
  });
});

describe('speed and time', () => {
  it('caps the limit at vmax', () => {
    expect(speedKmh(edge({ maxspeedFwd: 70 }), true, MOPED)).toBe(45);
    expect(speedKmh(edge({ maxspeedFwd: 30 }), true, MOPED)).toBe(30);
  });

  it('uses per-direction limits and class defaults', () => {
    const e = edge({ roadClass: RoadClass.PRIMARY, maxspeedFwd: 30, maxspeedBwd: null });
    expect(speedKmh(e, true, BIKE125)).toBe(30);
    expect(speedKmh(e, false, BIKE125)).toBe(100); // rural default
    expect(speedKmh(edge(), true, BIKE125)).toBe(50); // residential -> urban 50
  });

  it('slows down on bad surface', () => {
    expect(speedKmh(edge({ surface: Surface.COBBLE }), true, MOPED)).toBeCloseTo(36);
  });

  it('adds penalties', () => {
    const plain = travelTimeS(edge({ maxspeedFwd: 36 }), true, MOPED); // 10 m/s -> 100 s
    expect(plain).toBeCloseTo(100 + 2);
    const busy = travelTimeS(edge({ maxspeedFwd: 36, signals: 2, curvatureDeg: 100 }), true, MOPED);
    expect(busy).toBeCloseTo(100 + 2 + 2 * 5 + 2);
    // right of way on main roads: smaller junction penalty than in side streets
    const main = travelTimeS(edge({ maxspeedFwd: 36, roadClass: RoadClass.PRIMARY }), true, MOPED);
    expect(main).toBeCloseTo(100 + 0.5);
  });

  it('edge cost is infinite when not allowed and penalises destination roads', () => {
    expect(edgeCost(edge({ flags: 0 }), true, MOPED)).toBe(Infinity);
    const a = edgeCost(edge(), true, MOPED);
    const b = edgeCost(edge({ flags: AccessFlag.MOPED | AccessFlag.DESTINATION }), true, MOPED);
    expect(b - a).toBe(120);
  });
});
