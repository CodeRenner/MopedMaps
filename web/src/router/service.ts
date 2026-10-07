/**
 * Router service: holds the assembled graph and answers protocol requests.
 * Pure (no DOM, no Worker globals) so it can be unit-tested directly.
 */

import { MAX_SNAP_DISTANCE_M } from '../config';
import { findRoute } from './astar';
import { decodeChunk } from './chunk';
import { haversineM } from './geo';
import { assembleGraph, type Graph, nearestNode } from './graph';
import type { LatLon, RouterRequest, RouterResponse } from './protocol';
import { validateProfile } from './profile';

export class RouterService {
  private graph: Graph | null = null;

  handle(req: RouterRequest): RouterResponse {
    try {
      switch (req.type) {
        case 'load':
          return this.load(req.id, req.chunks);
        case 'route':
          return this.route(req);
      }
    } catch (err) {
      return { type: 'error', id: req.id, message: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Replace the graph with the given chunk set. */
  private load(id: number, buffers: ArrayBuffer[]): RouterResponse {
    this.graph = assembleGraph(buffers.map((b) => decodeChunk(b)));
    return { type: 'loaded', id, nodeCount: this.graph.nodeCount, edgeCount: this.graph.edges.length };
  }

  private snap(p: LatLon): number {
    const g = this.graph!;
    const n = nearestNode(g, p[0], p[1]);
    if (n < 0) return -1;
    return haversineM(p[0], p[1], g.lat[n]!, g.lon[n]!) <= MAX_SNAP_DISTANCE_M ? n : -1;
  }

  private route(req: Extract<RouterRequest, { type: 'route' }>): RouterResponse {
    const { id } = req;
    if (!this.graph) return { type: 'no-route', id, reason: 'no-graph' };
    const profile = validateProfile(req.profile);
    const t0 = performance.now();
    const s = this.snap(req.from);
    if (s < 0) return { type: 'no-route', id, reason: 'start-off-network' };
    const t = this.snap(req.to);
    if (t < 0) return { type: 'no-route', id, reason: 'target-off-network' };
    const r = findRoute(this.graph, s, t, profile, req.weights);
    if (!r) return { type: 'no-route', id, reason: 'unreachable' };
    return {
      type: 'route',
      id,
      route: {
        distanceM: r.distanceM,
        timeS: r.timeS,
        cost: r.cost,
        riskAvg: r.riskAvg,
        energyWh: r.energyWh,
        fuelL: r.fuelL,
        ascentM: r.ascentM,
        geometry: r.geometry,
        settled: r.settled,
        computeMs: performance.now() - t0,
      },
    };
  }
}
