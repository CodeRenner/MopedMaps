/**
 * Load the routing area around a location: plan tiles within the radius,
 * fetch/cache them and hand them to the router. Roadmap step 3 glue.
 */

import { DEFAULT_RADIUS_KM, MAX_RADIUS_KM, MIN_RADIUS_KM } from '../config';
import type { PlzIndex } from '../location/plz';
import { planTiles } from '../location/tiles';
import type { RouterPort } from '../router/port';
import { type LoadProgress, loadChunks } from './loader';
import { buildId, type Manifest } from './manifest';
import type { ChunkStore } from './store';

export function clampRadius(km: number): number {
  if (!Number.isFinite(km)) return DEFAULT_RADIUS_KM;
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, km));
}

export interface AreaRequest {
  /** Either a PLZ (resolved via plzIndex) or explicit coordinates. */
  plz?: string;
  centre?: [number, number];
  radiusKm?: number;
}

export interface AreaDeps {
  manifest: Manifest;
  plzIndex: PlzIndex;
  store: ChunkStore;
  router: RouterPort;
  baseUrl: string;
  fetchFn?: typeof fetch;
  onProgress?: (p: LoadProgress) => void;
  signal?: AbortSignal;
}

export interface LoadedArea {
  centre: [number, number];
  label: string;
  radiusKm: number;
  files: string[];
  downloadGzipBytes: number;
  nodeCount: number;
  edgeCount: number;
}

export class AreaError extends Error {
  constructor(
    readonly code: 'unknown-plz' | 'no-location' | 'no-tiles' | 'router',
    message: string,
  ) {
    super(message);
  }
}

export async function loadArea(req: AreaRequest, d: AreaDeps): Promise<LoadedArea> {
  let centre = req.centre;
  let label = centre ? `${centre[0].toFixed(4)}, ${centre[1].toFixed(4)}` : '';
  if (req.plz !== undefined) {
    const e = d.plzIndex.get(req.plz);
    if (!e) throw new AreaError('unknown-plz', `unknown PLZ ${req.plz}`);
    centre = [e.lat, e.lon];
    label = `${e.plz} ${e.name}`;
  }
  if (!centre) throw new AreaError('no-location', 'need a PLZ or coordinates');

  const radiusKm = clampRadius(req.radiusKm ?? DEFAULT_RADIUS_KM);
  const plan = planTiles(d.manifest, centre[0], centre[1], radiusKm);
  if (plan.files.length === 0) throw new AreaError('no-tiles', 'no map data for this area');

  const id = buildId(d.manifest);
  const buffers = await loadChunks(plan.files, {
    baseUrl: d.baseUrl,
    buildId: id,
    store: d.store,
    ...(d.fetchFn && { fetchFn: d.fetchFn }),
    ...(d.onProgress && { onProgress: d.onProgress }),
    ...(d.signal && { signal: d.signal }),
  });
  // Copies are transferred so the cache keeps its own buffers.
  const copies = buffers.map((b) => b.slice(0));
  const res = await d.router.request({ type: 'load', chunks: copies }, copies);
  if (res.type !== 'loaded') {
    throw new AreaError('router', res.type === 'error' ? res.message : `unexpected ${res.type}`);
  }
  await d.store.prune(id).catch(() => 0);
  return {
    centre,
    label,
    radiusKm,
    files: plan.files,
    downloadGzipBytes: plan.totalGzipBytes,
    nodeCount: res.nodeCount,
    edgeCount: res.edgeCount,
  };
}
