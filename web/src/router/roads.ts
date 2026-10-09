/**
 * Road lines of the loaded graph inside a bounding box, for drawing a simple
 * offline map when the basemap tiles are unavailable. Pure (worker side).
 */

import type { Graph } from './graph';

export interface RoadLines {
  /** lat, lon pairs of all lines, concatenated */
  coords: Float32Array;
  /** start index (in points) of each line, plus the total at the end */
  offsets: Uint32Array;
  /** road class per line (RoadClass codes, 0 = motorway) */
  classes: Uint8Array;
  /** true if `limit` cut the result (zoomed out too far) */
  truncated: boolean;
}

/** [south, west, north, east] */
export type Bbox = [number, number, number, number];

const edgeBoxes = new WeakMap<Graph, Float32Array>();

function boxes(g: Graph): Float32Array {
  let b = edgeBoxes.get(g);
  if (b) return b;
  b = new Float32Array(g.edges.length * 4);
  for (let e = 0; e < g.edges.length; e++) {
    const f = g.edgeFrom[e]!, t = g.edgeTo[e]!;
    let s = Math.min(g.lat[f]!, g.lat[t]!), n = Math.max(g.lat[f]!, g.lat[t]!);
    let w = Math.min(g.lon[f]!, g.lon[t]!), ea = Math.max(g.lon[f]!, g.lon[t]!);
    for (const [la, lo] of g.edges[e]!.shape) {
      s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); ea = Math.max(ea, lo);
    }
    b.set([s, w, n, ea], e * 4);
  }
  edgeBoxes.set(g, b);
  return b;
}

export function roadsInBbox(g: Graph, bbox: Bbox, maxClass: number, limit: number): RoadLines {
  const [s, w, n, e] = bbox;
  const b = boxes(g);
  const picked: number[] = [];
  let points = 0;
  let truncated = false;
  for (let i = 0; i < g.edges.length; i++) {
    if (g.edges[i]!.roadClass > maxClass) continue;
    const o = i * 4;
    if (b[o + 2]! < s || b[o]! > n || b[o + 3]! < w || b[o + 1]! > e) continue;
    if (picked.length >= limit) {
      truncated = true;
      break;
    }
    picked.push(i);
    points += g.edges[i]!.shape.length + 2;
  }
  const coords = new Float32Array(points * 2);
  const offsets = new Uint32Array(picked.length + 1);
  const classes = new Uint8Array(picked.length);
  let p = 0;
  picked.forEach((i, k) => {
    offsets[k] = p;
    classes[k] = g.edges[i]!.roadClass;
    const f = g.edgeFrom[i]!, t = g.edgeTo[i]!;
    coords[p * 2] = g.lat[f]!; coords[p * 2 + 1] = g.lon[f]!; p++;
    for (const [la, lo] of g.edges[i]!.shape) {
      coords[p * 2] = la; coords[p * 2 + 1] = lo; p++;
    }
    coords[p * 2] = g.lat[t]!; coords[p * 2 + 1] = g.lon[t]!; p++;
  });
  offsets[picked.length] = p;
  return { coords, offsets, classes, truncated };
}

/** Which road classes to draw at a zoom level (fewer when zoomed out). */
export function maxClassForZoom(zoom: number): number {
  if (zoom < 10) return 2; // trunk, primary
  if (zoom < 12) return 4; // + secondary, tertiary
  if (zoom < 13.5) return 6; // + unclassified, residential
  return 8; // + living street, service
}
