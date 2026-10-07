/**
 * A* shortest path on the assembled graph. Pure; runs in a Web Worker.
 *
 * Heuristic: straight-line distance / vmax, times the time weight. It is
 * admissible because every edge is at least as long as its chord, speed never
 * exceeds vmax and all penalties are >= 0. The risk term is >= 0 and simply
 * not estimated (stays admissible); energy (step 6) must also stay >= 0.
 */

import type { Graph } from './graph';
import { haversineM } from './geo';
import { MinHeap } from './heap';
import {
  type CostWeights,
  DEFAULT_WEIGHTS,
  edgeCost,
  edgeRisk,
  travelTimeS,
  type VehicleProfile,
} from './profile';

export interface Route {
  /** Global node ids from start to target. */
  nodes: number[];
  /** Arc indices traversed (one fewer than nodes). */
  arcs: number[];
  cost: number;
  timeS: number;
  distanceM: number;
  /** Length-weighted mean risk score of the route (0 if not computed). */
  riskAvg: number;
  /** Full polyline [lat, lon] including edge shape points. */
  geometry: [number, number][];
  /** Nodes settled during search (performance metric). */
  settled: number;
}

export function findRoute(
  g: Graph,
  start: number,
  target: number,
  profile: VehicleProfile,
  weights: CostWeights = DEFAULT_WEIGHTS,
  opts: { heuristic?: boolean } = {},
): Route | null {
  const n = g.nodeCount;
  if (start < 0 || target < 0 || start >= n || target >= n) return null;
  const gScore = new Float64Array(n).fill(Infinity);
  const viaArc = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const tLat = g.lat[target]!;
  const tLon = g.lon[target]!;
  // heuristic=false turns A* into Dijkstra (used as a test reference).
  const hFactor = opts.heuristic === false ? 0 : weights.time / (profile.vmaxKmh / 3.6);
  const h = (v: number) => haversineM(g.lat[v]!, g.lon[v]!, tLat, tLon) * hFactor;

  const open = new MinHeap();
  gScore[start] = 0;
  open.push(h(start), start);
  let settled = 0;

  while (open.size > 0) {
    const u = open.pop();
    if (closed[u]) continue; // stale heap entry
    closed[u] = 1;
    settled++;
    if (u === target) break;
    const gu = gScore[u]!;
    for (let a = g.arcStart[u]!; a < g.arcStart[u + 1]!; a++) {
      const v = g.arcTarget[a]!;
      if (closed[v]) continue;
      const c = edgeCost(g.edges[g.arcEdge[a]!]!, g.arcForward[a] === 1, profile, weights);
      if (c === Infinity) continue;
      const gv = gu + c;
      if (gv < gScore[v]!) {
        gScore[v] = gv;
        viaArc[v] = a;
        open.push(gv + h(v), v);
      }
    }
  }
  if (!closed[target]) return null;
  return buildRoute(g, start, target, viaArc, gScore[target]!, profile, settled);
}

function buildRoute(
  g: Graph,
  start: number,
  target: number,
  viaArc: Int32Array,
  cost: number,
  profile: VehicleProfile,
  settled: number,
): Route {
  const arcs: number[] = [];
  for (let v = target; v !== start; ) {
    const a = viaArc[v]!;
    arcs.push(a);
    const e = g.arcEdge[a]!;
    v = g.arcForward[a] === 1 ? g.edgeFrom[e]! : g.edgeTo[e]!;
  }
  arcs.reverse();

  const nodes = [start];
  const geometry: [number, number][] = [[g.lat[start]!, g.lon[start]!]];
  let timeS = 0;
  let distanceM = 0;
  let riskSum = 0;
  for (const a of arcs) {
    const e = g.edges[g.arcEdge[a]!]!;
    const fwd = g.arcForward[a] === 1;
    const v = g.arcTarget[a]!;
    geometry.push(...(fwd ? e.shape : [...e.shape].reverse()), [g.lat[v]!, g.lon[v]!]);
    nodes.push(v);
    timeS += travelTimeS(e, fwd, profile);
    distanceM += e.lengthM;
    riskSum += edgeRisk(e);
  }
  const riskAvg = distanceM > 0 ? riskSum / (distanceM / 1000) : 0;
  return { nodes, arcs, cost, timeS, distanceM, riskAvg, geometry, settled };
}
