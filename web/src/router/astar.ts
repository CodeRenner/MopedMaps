/**
 * A* shortest path on the assembled graph. Pure; runs in a Web Worker.
 *
 * Heuristic: straight-line distance / vmax, times the time weight. It is
 * admissible because every edge is at least as long as its chord, speed never
 * exceeds vmax and all penalties are >= 0. The risk term is >= 0 and simply
 * not estimated (stays admissible); energy (step 6) must also stay >= 0.
 */

import { CLOSURE_AVOID_PENALTY_S } from '../config';
import { edgeEnergy } from './energy';
import type { Graph } from './graph';
import { haversineM } from './geo';
import { MinHeap } from './heap';
import {
  type CostWeights,
  DEFAULT_WEIGHTS,
  edgeCost,
  edgeRisk,
  limitKmh,
  speedKmh,
  travelTimeS,
  type VehicleProfile,
} from './profile';
import { climbWithHysteresis, hasFullHeights, type RouteProfile } from './routeProfile';
import { turnCost } from './turns';

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
  /** Battery energy (electric) or fuel energy (combustion), Wh. */
  energyWh: number;
  /** Combustion only: petrol in litres. */
  fuelL: number;
  /** Total climb along the route (m): from node heights with hysteresis, else edge sums. */
  ascentM: number;
  /** Distance / elevation / speed along the route (for the route chart). */
  profile: RouteProfile;
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
  if (start === target) return buildRoute(g, start, [], 0, profile, 0);
  // Edge-based search: the state is the arc just driven, so turns between
  // consecutive arcs can be priced (turns.ts). Arc costs are cached.
  const m = g.arcTarget.length;
  const gScore = new Float64Array(m).fill(Infinity);
  const prevArc = new Int32Array(m).fill(-1);
  const closed = new Uint8Array(m);
  const arcCostCache = new Float64Array(m).fill(Number.NaN);
  const tLat = g.lat[target]!;
  const tLon = g.lon[target]!;
  // heuristic=false turns A* into Dijkstra (used as a test reference).
  const hFactor = opts.heuristic === false ? 0 : weights.time / (profile.vmaxKmh / 3.6);
  const h = (v: number) => haversineM(g.lat[v]!, g.lon[v]!, tLat, tLon) * hFactor;
  const cs = g.closures;
  const turnFactor = weights.prefs?.junctions ?? 1;

  const arcCost = (a: number): number => {
    const cached = arcCostCache[a]!;
    if (!Number.isNaN(cached)) return cached;
    const ei = g.arcEdge[a]!;
    const fwd = g.arcForward[a] === 1;
    let c: number;
    if (cs && (fwd ? cs.closedFwd[ei] : cs.closedBwd[ei])) c = Infinity; // road closed
    else {
      c = edgeCost(g.edges[ei]!, fwd, profile, weights);
      if (c !== Infinity && cs?.avoid[ei]) c += weights.time * CLOSURE_AVOID_PENALTY_S;
    }
    arcCostCache[a] = c;
    return c;
  };
  const turn = (inArc: number, outArc: number): number => {
    const t = turnCost(g, inArc, outArc);
    return turnFactor * (weights.time * t.timeS + weights.risk * t.riskPts);
  };

  const open = new MinHeap();
  for (let a = g.arcStart[start]!; a < g.arcStart[start + 1]!; a++) {
    const c = arcCost(a);
    if (c === Infinity) continue;
    gScore[a] = c;
    open.push(c + h(g.arcTarget[a]!), a);
  }
  let settled = 0;
  let reached = -1;

  while (open.size > 0) {
    const a = open.pop();
    if (closed[a]) continue; // stale heap entry
    closed[a] = 1;
    settled++;
    const v = g.arcTarget[a]!;
    if (v === target) {
      reached = a;
      break;
    }
    const ga = gScore[a]!;
    for (let b = g.arcStart[v]!; b < g.arcStart[v + 1]!; b++) {
      if (closed[b]) continue;
      const c = arcCost(b);
      if (c === Infinity) continue;
      const gb = ga + c + turn(a, b);
      if (gb < gScore[b]!) {
        gScore[b] = gb;
        prevArc[b] = a;
        open.push(gb + h(g.arcTarget[b]!), b);
      }
    }
  }
  if (reached < 0) return null;
  const arcs: number[] = [];
  for (let a = reached; a >= 0; a = prevArc[a]!) arcs.push(a);
  arcs.reverse();
  return buildRoute(g, start, arcs, gScore[reached]!, profile, settled);
}

function buildRoute(
  g: Graph,
  start: number,
  arcs: number[],
  cost: number,
  profile: VehicleProfile,
  settled: number,
): Route {
  const nodes = [start];
  const geometry: [number, number][] = [[g.lat[start]!, g.lon[start]!]];
  let timeS = 0;
  let distanceM = 0;
  let riskSum = 0;
  let energyWh = 0;
  let fuelL = 0;
  let edgeAscentM = 0;
  const distM = [0];
  const heightOf = (v: number) => (Number.isNaN(g.height[v]!) ? null : g.height[v]!);
  const heightM = [heightOf(start)];
  const speeds: number[] = [];
  const limits: number[] = [];
  const geomIndex = [0];
  for (let k = 0; k < arcs.length; k++) {
    const a = arcs[k]!;
    if (k > 0) timeS += turnCost(g, arcs[k - 1]!, a).timeS; // realistic turn time (unscaled)
    const e = g.edges[g.arcEdge[a]!]!;
    const fwd = g.arcForward[a] === 1;
    const v = g.arcTarget[a]!;
    geometry.push(...(fwd ? e.shape : [...e.shape].reverse()), [g.lat[v]!, g.lon[v]!]);
    nodes.push(v);
    timeS += travelTimeS(e, fwd, profile);
    distanceM += e.lengthM;
    riskSum += edgeRisk(e, fwd, profile);
    const en = edgeEnergy(e, fwd, profile);
    energyWh += en.sourceWh;
    fuelL += en.fuelL;
    edgeAscentM += fwd ? e.ascentM : e.descentM;
    distM.push(distanceM);
    heightM.push(heightOf(v));
    speeds.push(speedKmh(e, fwd, profile));
    limits.push(limitKmh(e, fwd));
    geomIndex.push(geometry.length - 1);
  }
  const routeProfile: RouteProfile = { distM, heightM, speedKmh: speeds, limitKmh: limits, geomIndex };
  // Node heights (format v2) are smoothed and give a far better total than
  // summing per-edge climbs; fall back to the edges for v1 tiles.
  const ascentM = hasFullHeights(routeProfile) ? climbWithHysteresis(heightM) : edgeAscentM;
  const riskAvg = distanceM > 0 ? riskSum / (distanceM / 1000) : 0;
  return { nodes, arcs, cost, timeS, distanceM, riskAvg, energyWh, fuelL, ascentM, profile: routeProfile, geometry, settled };
}
