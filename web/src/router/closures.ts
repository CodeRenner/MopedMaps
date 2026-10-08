/**
 * Apply road closures (daily closures.json) to the graph. Pure; runs in the
 * router worker. Lines (kind "closed") block the edges that mostly lie on
 * them, in one or both directions; polygons (kind "avoid") make the edges
 * mostly inside them expensive.
 */

import {
  CLOSURE_AVOID_SHARE,
  CLOSURE_MATCH_M,
  CLOSURE_MATCH_SHARE,
} from '../config';
import type { Graph } from './graph';
import type { LatLon } from './protocol';

export interface Closure {
  id: string;
  kind: 'closed' | 'avoid';
  oneway: boolean;
  label: string;
  note?: string;
  start: string | null;
  end: string | null;
  line?: LatLon[];
  polygon?: LatLon[];
}

/** Per-edge state written by `applyClosures` (parallel to graph.edges). */
export interface ClosureState {
  /** 1 = closed in edge direction (from -> to) */
  closedFwd: Uint8Array;
  /** 1 = closed against edge direction */
  closedBwd: Uint8Array;
  avoid: Uint8Array;
  /** Closures that matched at least one edge. */
  matched: string[];
}

export function isActive(c: Closure, now: Date): boolean {
  const t = now.getTime();
  if (c.start && Date.parse(c.start) > t) return false;
  if (c.end && Date.parse(c.end) < t) return false;
  return true;
}

const M_PER_DEG = 111_195;

/** Local metric projection around a latitude. */
function projector(lat0: number) {
  const kx = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  return (p: LatLon): [number, number] => [p[1] * kx, p[0] * M_PER_DEG];
}

function distToPolyline(p: [number, number], line: [number, number][]): { d: number; seg: number } {
  let best = { d: Infinity, seg: 0 };
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = line[i]!;
    const [bx, by] = line[i + 1]!;
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const u = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2)) : 0;
    const d = Math.hypot(p[0] - (ax + u * dx), p[1] - (ay + u * dy));
    if (d < best.d) best = { d, seg: i };
  }
  return best;
}

function inPolygon(p: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Edge polyline (from node, shape points, to node). */
function edgePoints(g: Graph, e: number): LatLon[] {
  const f = g.edgeFrom[e]!, t = g.edgeTo[e]!;
  return [[g.lat[f]!, g.lon[f]!], ...g.edges[e]!.shape, [g.lat[t]!, g.lon[t]!]];
}

/** Points every <= 10 m along a projected polyline. */
function samples(pts: [number, number][]): [number, number][] {
  const out: [number, number][] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]!;
    const [bx, by] = pts[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 10));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

function bbox(pts: LatLon[], padM: number): [number, number, number, number] {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const [la, lo] of pts) {
    s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo);
  }
  const dLat = padM / M_PER_DEG;
  const dLon = padM / (M_PER_DEG * Math.cos((((s + n) / 2) * Math.PI) / 180));
  return [s - dLat, w - dLon, n + dLat, e + dLon];
}

export function applyClosures(g: Graph, closures: readonly Closure[], now: Date): ClosureState {
  const m = g.edges.length;
  const state: ClosureState = {
    closedFwd: new Uint8Array(m),
    closedBwd: new Uint8Array(m),
    avoid: new Uint8Array(m),
    matched: [],
  };
  if (m === 0) return state;
  // Edge bounding boxes from their end nodes and shape points.
  const eb = new Float64Array(m * 4);
  for (let e = 0; e < m; e++) {
    const b = bbox(edgePoints(g, e), 0);
    eb.set(b, e * 4);
  }
  for (const c of closures) {
    const geom = c.kind === 'closed' ? c.line : c.polygon;
    if (!geom || geom.length < 2 || !isActive(c, now)) continue;
    const [s, w, n, ea] = bbox(geom, CLOSURE_MATCH_M + 5);
    const proj = projector(geom[0]![0]);
    const shape = geom.map(proj);
    let hit = false;
    for (let e = 0; e < m; e++) {
      const o = e * 4;
      if (eb[o + 2]! < s || eb[o]! > n || eb[o + 3]! < w || eb[o + 1]! > ea) continue;
      const pts = edgePoints(g, e).map(proj);
      const smp = samples(pts);
      if (c.kind === 'avoid') {
        const inside = smp.filter((p) => inPolygon(p, shape)).length;
        if (inside / smp.length >= CLOSURE_AVOID_SHARE) {
          state.avoid[e] = 1;
          hit = true;
        }
        continue;
      }
      let near = 0;
      let dir = 0; // > 0: edge runs with the closure line
      for (let i = 0; i < smp.length; i++) {
        const r = distToPolyline(smp[i]!, shape);
        if (r.d > CLOSURE_MATCH_M) continue;
        near++;
        if (i > 0) {
          const [ax, ay] = shape[r.seg]!;
          const [bx, by] = shape[r.seg + 1]!;
          dir += (smp[i]![0] - smp[i - 1]![0]) * (bx - ax) + (smp[i]![1] - smp[i - 1]![1]) * (by - ay);
        }
      }
      if (near / smp.length < CLOSURE_MATCH_SHARE) continue;
      hit = true;
      if (!c.oneway || dir >= 0) state.closedFwd[e] = 1;
      if (!c.oneway || dir < 0) state.closedBwd[e] = 1;
    }
    if (hit) state.matched.push(c.id);
  }
  return state;
}
