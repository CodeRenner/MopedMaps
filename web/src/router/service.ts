/**
 * Router service: holds the assembled graph and answers protocol requests.
 * Pure (no DOM, no Worker globals) so it can be unit-tested directly.
 */

import { MAX_SNAP_DISTANCE_M } from '../config';
import { findRoute } from './astar';
import { applyClosures, type Closure } from './closures';
import { decodeChunk } from './chunk';
import { haversineM } from './geo';
import { assembleGraph, type Graph, nearestNode } from './graph';
import type { LatLon, RouterRequest, RouterResponse } from './protocol';
import { validateProfile } from './profile';
import { roadsInBbox } from './roads';

export class RouterService {
  private graph: Graph | null = null;
  private closures: { list: Closure[]; now: number } | null = null;

  handle(req: RouterRequest): RouterResponse {
    try {
      switch (req.type) {
        case 'load':
          return this.load(req.id, req.chunks);
        case 'closures':
          this.closures = { list: req.closures, now: req.now };
          return { type: 'closures', id: req.id, matched: this.applyClosures() };
        case 'route':
          return this.route(req);
        case 'roads':
          return {
            type: 'roads',
            id: req.id,
            roads: this.graph
              ? roadsInBbox(this.graph, req.bbox, req.maxClass, req.limit)
              : { coords: new Float32Array(), offsets: new Uint32Array([0]), classes: new Uint8Array(), truncated: false },
          };
      }
    } catch (err) {
      return { type: 'error', id: req.id, message: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Replace the graph with the given chunk set. */
  private load(id: number, buffers: ArrayBuffer[]): RouterResponse {
    this.graph = assembleGraph(buffers.map((b) => decodeChunk(b)));
    this.applyClosures(); // keep known closures across area changes
    return { type: 'loaded', id, nodeCount: this.graph.nodeCount, edgeCount: this.graph.edges.length };
  }

  private applyClosures(): string[] {
    if (!this.graph || !this.closures) return [];
    const state = applyClosures(this.graph, this.closures.list, new Date(this.closures.now));
    this.graph.closures = state;
    return state.matched;
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
        profile: r.profile,
        geometry: r.geometry,
        settled: r.settled,
        computeMs: performance.now() - t0,
      },
    };
  }
}
