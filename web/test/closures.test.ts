import { describe, expect, it } from 'vitest';
import { findRoute } from '../src/router/astar';
import { AccessFlag, type Chunk, type ChunkEdge, RoadClass, Surface } from '../src/router/chunk';
import { applyClosures, type Closure, isActive } from '../src/router/closures';
import { assembleGraph } from '../src/router/graph';
import { RouterService } from '../src/router/service';

const MOPED = { vmaxKmh: 45, drive: 'electric' } as const;
const W = { time: 1, risk: 0, energy: 0 };

function e(from: number, to: number, lengthM: number): ChunkEdge {
  return {
    fromIdx: from, toIdx: to, toTile: [0, 0], roadClass: RoadClass.RESIDENTIAL,
    flags: AccessFlag.MOPED | AccessFlag.MOFA, maxspeedFwd: 30, maxspeedBwd: 30,
    surface: Surface.PAVED, lit: null, cycleway: false, signals: 0, lengthM,
    curvatureDeg: 0, ascentM: 0, descentM: 0, risk: 40, shape: [],
  };
}

/** A(0) -> B(1) direct along the equator (~1.1 km), or via C(2) north (longer). */
const chunk = (): Chunk => ({
  key: [0, 0], tileSize: 0.25,
  nodes: [[0, 0], [0, 0.01], [0.004, 0.005]],
  heights: [null, null, null],
  edges: [e(0, 1, 1112), e(0, 2, 720), e(2, 1, 720)],
});
const line = (oneway: boolean, reverse = false): Closure => ({
  id: 'c1', kind: 'closed', oneway, label: 'L 1', start: null, end: null,
  line: reverse ? [[0, 0.008], [0, 0.002]] : [[0, 0.002], [0, 0.008]],
});

describe('road closures', () => {
  it('checks the time window', () => {
    const now = new Date('2026-10-08T12:00:00Z');
    const c = { ...line(false), start: '2026-10-01T00:00:00+02:00', end: '2026-10-20T00:00:00+02:00' };
    expect(isActive(c, now)).toBe(true);
    expect(isActive({ ...c, start: '2026-10-09T00:00:00Z' }, now)).toBe(false);
    expect(isActive({ ...c, end: '2026-10-07T00:00:00Z' }, now)).toBe(false);
  });

  it('a closed line blocks the edge it lies on, both directions', () => {
    const g = assembleGraph([chunk()]);
    expect(findRoute(g, 0, 1, MOPED, W)!.nodes).toEqual([0, 1]);
    // the closure covers 60 % of edge 0 -> below the share; extend it to the full edge
    g.closures = applyClosures(g, [{ ...line(false), line: [[0, 0], [0, 0.01]] }], new Date());
    expect(g.closures.matched).toEqual(['c1']);
    expect(findRoute(g, 0, 1, MOPED, W)!.nodes).toEqual([0, 2, 1]);
    expect(findRoute(g, 1, 0, MOPED, W)!.nodes).toEqual([1, 2, 0]);
  });

  it('partial overlap below the share does not block', () => {
    const g = assembleGraph([chunk()]);
    g.closures = applyClosures(g, [line(false)], new Date());
    expect(g.closures.matched).toEqual([]);
  });

  it('one-direction closures block only the matching direction', () => {
    const g = assembleGraph([chunk()]);
    g.closures = applyClosures(g, [{ ...line(true), line: [[0, 0.01], [0, 0]] }], new Date()); // drawn B -> A
    expect(findRoute(g, 0, 1, MOPED, W)!.nodes).toEqual([0, 1]); // A -> B open
    expect(findRoute(g, 1, 0, MOPED, W)!.nodes).toEqual([1, 2, 0]); // B -> A closed
  });

  it('avoid polygons add a penalty but keep the road usable', () => {
    const g = assembleGraph([chunk()]);
    const poly: Closure = {
      id: 'fr', kind: 'avoid', oneway: false, label: 'Baustelle', start: null, end: null,
      polygon: [[-0.001, -0.001], [-0.001, 0.011], [0.001, 0.011], [0.001, -0.001]],
    };
    g.closures = applyClosures(g, [poly], new Date());
    expect(Array.from(g.closures.avoid)).toEqual([1, 0, 0]);
    expect(findRoute(g, 0, 1, MOPED, W)!.nodes).toEqual([0, 2, 1]); // detour cheaper than +600 s
  });

  it('the service accepts closures before a graph is loaded', () => {
    const svc = new RouterService();
    const res = svc.handle({ type: 'closures', id: 1, closures: [{ ...line(false), line: [[0, 0], [0, 0.01]] }], now: Date.now() });
    expect(res).toEqual({ type: 'closures', id: 1, matched: [] }); // no graph yet
  });
});
