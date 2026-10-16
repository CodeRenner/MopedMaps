/**
 * Router service: holds the assembled graph and answers protocol requests.
 * Pure (no DOM, no Worker globals) so it can be unit-tested directly.
 */

import { applyClosures, type Closure } from './closures';
import { decodeChunk } from './chunk';
import { assembleGraph, type Graph } from './graph';
import type { RouterRequest, RouterResponse } from './protocol';
import { validateProfile } from './profile';
import { routeSnapped } from './snap';
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

  private route(req: Extract<RouterRequest, { type: 'route' }>): RouterResponse {
    const { id } = req;
    const g = this.graph;
    if (!g) return { type: 'no-route', id, reason: 'no-graph' };
    const profile = validateProfile(req.profile);
    const t0 = performance.now();
    const res = routeSnapped(g, req.from, req.to, profile, req.weights);
    if (typeof res === 'string') return { type: 'no-route', id, reason: res };
    const { route: r, startGapM, targetGapM } = res;
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
        startGapM,
        targetGapM,
        profile: r.profile,
        geometry: r.geometry,
        settled: r.settled,
        computeMs: performance.now() - t0,
      },
    };
  }
}
