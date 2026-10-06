/**
 * Assemble loaded chunks into one routable graph.
 *
 * Nodes get dense global ids; directed arcs are stored in CSR form
 * (arcStart[n]..arcStart[n+1]) for cache-friendly A*. Oneway flags decide
 * which directions exist. Edges pointing into a tile that is not loaded are
 * dropped: routes are limited to the loaded area by design.
 */

import { AccessFlag, type Chunk, type ChunkEdge, type TileKey } from './chunk';

export interface Graph {
  nodeCount: number;
  lat: Float64Array;
  lon: Float64Array;
  edges: ChunkEdge[];
  /** Global from/to node id per edge (parallel to `edges`). */
  edgeFrom: Uint32Array;
  edgeTo: Uint32Array;
  /** CSR adjacency: arcs of node n are arcStart[n] .. arcStart[n+1]-1. */
  arcStart: Uint32Array;
  arcTarget: Uint32Array;
  arcEdge: Uint32Array;
  /** 1 if the arc runs along the edge (from -> to), 0 if against it. */
  arcForward: Uint8Array;
}

const keyStr = (k: TileKey): string => `${k[0]},${k[1]}`;

export function assembleGraph(chunks: readonly Chunk[]): Graph {
  // 1. Global node ids: offset per tile.
  const offset = new Map<string, number>();
  let nodeCount = 0;
  for (const c of chunks) {
    const k = keyStr(c.key);
    if (offset.has(k)) throw new Error(`duplicate chunk ${k}`);
    offset.set(k, nodeCount);
    nodeCount += c.nodes.length;
  }
  const lat = new Float64Array(nodeCount);
  const lon = new Float64Array(nodeCount);
  for (const c of chunks) {
    const base = offset.get(keyStr(c.key)) ?? 0;
    c.nodes.forEach(([la, lo], i) => {
      lat[base + i] = la;
      lon[base + i] = lo;
    });
  }

  // 2. Keep edges whose both ends are loaded.
  const edges: ChunkEdge[] = [];
  const from: number[] = [];
  const to: number[] = [];
  for (const c of chunks) {
    const base = offset.get(keyStr(c.key)) ?? 0;
    for (const e of c.edges) {
      const toBase = offset.get(keyStr(e.toTile));
      if (toBase === undefined) continue;
      edges.push(e);
      from.push(base + e.fromIdx);
      to.push(toBase + e.toIdx);
    }
  }

  // 3. Directed arcs -> CSR.
  const degree = new Uint32Array(nodeCount + 1);
  const fwdOk = (e: ChunkEdge) => (e.flags & AccessFlag.ONEWAY_REVERSE) === 0;
  const bwdOk = (e: ChunkEdge) => (e.flags & AccessFlag.ONEWAY) === 0;
  edges.forEach((e, i) => {
    if (fwdOk(e)) degree[from[i]!]!++;
    if (bwdOk(e)) degree[to[i]!]!++;
  });
  const arcStart = new Uint32Array(nodeCount + 1);
  for (let n = 0; n < nodeCount; n++) arcStart[n + 1] = arcStart[n]! + degree[n]!;
  const arcCount = arcStart[nodeCount]!;
  const arcTarget = new Uint32Array(arcCount);
  const arcEdge = new Uint32Array(arcCount);
  const arcForward = new Uint8Array(arcCount);
  const fill = arcStart.slice(0, nodeCount);
  const push = (src: number, dst: number, edge: number, fwd: number) => {
    const p = fill[src]!++;
    arcTarget[p] = dst;
    arcEdge[p] = edge;
    arcForward[p] = fwd;
  };
  edges.forEach((e, i) => {
    if (fwdOk(e)) push(from[i]!, to[i]!, i, 1);
    if (bwdOk(e)) push(to[i]!, from[i]!, i, 0);
  });

  return {
    nodeCount,
    lat,
    lon,
    edges,
    edgeFrom: Uint32Array.from(from),
    edgeTo: Uint32Array.from(to),
    arcStart,
    arcTarget,
    arcEdge,
    arcForward,
  };
}

/**
 * Nearest node that has at least one edge, by squared equirectangular
 * distance. Linear scan; a spatial index can replace it if it shows up in
 * profiles. Returns -1 if the graph has no edges.
 */
export function nearestNode(g: Graph, lat: number, lon: number): number {
  const connected = new Uint8Array(g.nodeCount);
  for (let i = 0; i < g.edges.length; i++) {
    connected[g.edgeFrom[i]!] = 1;
    connected[g.edgeTo[i]!] = 1;
  }
  const k = Math.cos((lat * Math.PI) / 180);
  let best = -1;
  let bestD = Infinity;
  for (let n = 0; n < g.nodeCount; n++) {
    if (!connected[n]) continue;
    const dy = g.lat[n]! - lat;
    const dx = (g.lon[n]! - lon) * k;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

