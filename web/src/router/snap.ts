/**
 * Snapping start/target points to the road network, with a fallback for
 * points the vehicle cannot reach directly. Pure; see docs/routing-model.md.
 *
 * Points snap to the nearest node of a road this vehicle may use. That road
 * must be within SNAP_FALLBACK_M of the nearest road of any kind, so a point
 * on a long footway is "not allowed" rather than silently moved far away.
 * If no route exists between the nearest usable nodes (e.g. a car park whose
 * aisles are cut off by a private or barred entrance), other usable nodes in
 * that range are tried: first other starts if the search stayed on a small
 * island, then the target node nearest to the point among everything
 * reachable from the start. The distance to the point is reported so the UI
 * can say where the route really begins/ends.
 */

import { MAX_SNAP_DISTANCE_M, SNAP_FALLBACK_M, SNAP_FALLBACK_TRIES, SNAP_ISLAND_MAX_NODES } from '../config';
import { findRoute, type Route } from './astar';
import { type Graph, nodesNear } from './graph';
import { canUse, type CostWeights, type VehicleProfile } from './profile';
import type { LatLon, NoRouteReason } from './protocol';

type Candidate = { node: number; distM: number };

/** Usable nodes near a point (nearest first); null if there is no road of any kind within MAX_SNAP_DISTANCE_M. */
export function snapCandidates(g: Graph, p: LatLon, profile: VehicleProfile): Candidate[] | null {
  const any = nodesNear(g, p[0], p[1], MAX_SNAP_DISTANCE_M, () => true)[0];
  if (!any) return null;
  return nodesNear(g, p[0], p[1], any.distM + SNAP_FALLBACK_M, (i) => canUse(g.edges[i]!, profile));
}

export function routeSnapped(
  g: Graph,
  from: LatLon,
  to: LatLon,
  profile: VehicleProfile,
  weights?: CostWeights,
): { route: Route; startGapM: number; targetGapM: number } | Exclude<NoRouteReason, 'no-graph'> {
  const starts = snapCandidates(g, from, profile);
  if (!starts) return 'start-off-network';
  const targets = snapCandidates(g, to, profile);
  if (!targets) return 'target-off-network';
  if (starts.length === 0 || targets.length === 0) return 'unreachable';
  const count = (mask: Uint8Array) => mask.reduce((n, x) => n + x, 0);
  const attempt = (s: number, t: number, mask?: Uint8Array) =>
    findRoute(g, s, t, profile, weights, mask ? { reachable: mask } : {});

  let start = starts[0]!;
  let target = targets[0]!;
  let mask = new Uint8Array(g.nodeCount);
  let r = attempt(start.node, target.node, mask);
  if (!r && count(mask) < SNAP_ISLAND_MAX_NODES) {
    // The start is on an island: try nearby starts outside it.
    const island = mask;
    for (const c of starts.filter((x) => !island[x.node]).slice(0, SNAP_FALLBACK_TRIES)) {
      const m = new Uint8Array(g.nodeCount);
      r = attempt(c.node, target.node, m);
      if (r || count(m) >= SNAP_ISLAND_MAX_NODES) {
        start = c;
        mask = m;
        break;
      }
    }
  }
  if (!r) {
    // Everything reachable from the start is in `mask`: end at its node nearest to the target point.
    const reachable = mask;
    const c = targets.find((x) => reachable[x.node] && x.node !== target.node);
    if (c) {
      target = c;
      r = attempt(start.node, c.node);
    }
  }
  if (!r) return 'unreachable';
  return { route: r, startGapM: start.distM, targetGapM: target.distM };
}
