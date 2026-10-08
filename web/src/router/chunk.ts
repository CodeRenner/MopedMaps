/**
 * Decoder for graph chunks (`.mmg` v1). Mirrors
 * pipeline/src/mopedmaps_pipeline/chunks.py; spec in docs/chunk-format.md.
 * Pure: no DOM, usable in a Web Worker.
 */

export const MAGIC = 'MMG1';
/** Latest format; v1 (no node heights) is still decoded. */
export const VERSION = 2;
export const HEIGHT_UNKNOWN = -32768;
/** Edge DTV is stored in units of this many vehicles/day (pipeline config.TRAFFIC_DTV_UNIT). */
export const DTV_UNIT = 10;
const COORD_SCALE = 1e7;
const HEADER_SIZE = 32;
const NODE_SIZE_V1 = 8;
const NODE_SIZE_V2 = 10;
const EDGE_SIZE = 36;

/** Tile key [ix, iy] = [lon index, lat index]. */
export type TileKey = readonly [number, number];

export const RoadClass = {
  MOTORWAY: 0,
  TRUNK: 1,
  PRIMARY: 2,
  SECONDARY: 3,
  TERTIARY: 4,
  UNCLASSIFIED: 5,
  RESIDENTIAL: 6,
  LIVING_STREET: 7,
  SERVICE: 8,
  TRACK: 9,
  CYCLEWAY: 10,
  PATH: 11,
} as const;

export const AccessFlag = {
  MOPED: 1,
  MOFA: 2,
  MOTORROAD: 4,
  DESTINATION: 8,
  ONEWAY: 16,
  ONEWAY_REVERSE: 32,
} as const;

export const Surface = { UNKNOWN: 0, PAVED: 1, COBBLE: 2, COMPACTED: 3, UNPAVED: 4 } as const;

export interface ChunkEdge {
  fromIdx: number;
  toTile: TileKey;
  toIdx: number;
  roadClass: number;
  flags: number;
  /** km/h, null = unknown */
  maxspeedFwd: number | null;
  maxspeedBwd: number | null;
  surface: number;
  lit: boolean | null;
  cycleway: boolean;
  signals: number;
  lengthM: number;
  curvatureDeg: number;
  ascentM: number;
  descentM: number;
  risk: number;
  /** Traffic volume, vehicles/day (official counts); 0 or missing = unknown. */
  dtv?: number;
  /** Intermediate shape points as [lat, lon]; endpoints are the nodes. */
  shape: [number, number][];
}

export interface Chunk {
  key: TileKey;
  tileSize: number;
  /** Junction nodes as [lat, lon], indexed tile-locally. */
  nodes: [number, number][];
  /** Smoothed node heights in metres (v2), null = unknown. */
  heights: (number | null)[];
  edges: ChunkEdge[];
}

export function tileOf(lat: number, lon: number, size: number): TileKey {
  return [Math.floor(lon / size), Math.floor(lat / size)];
}

export function tileName(key: TileKey): string {
  return `${key[1]}_${key[0]}.mmg`;
}

function readVarint(buf: Uint8Array, pos: number): [number, number] {
  // Values fit in 2^53 here (zigzag of int32 deltas), so plain arithmetic is safe.
  let n = 0;
  let mul = 1;
  for (;;) {
    const b = buf[pos++];
    if (b === undefined) throw new RangeError('varint past end of chunk');
    n += (b & 0x7f) * mul;
    if (b < 0x80) return [n, pos];
    mul *= 128;
  }
}

function unzigzag(n: number): number {
  return n % 2 === 0 ? n / 2 : -(n + 1) / 2;
}

export function decodeChunk(data: ArrayBuffer | Uint8Array): Chunk {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  const version = v.getUint16(4, true);
  if (magic !== MAGIC || (version !== 1 && version !== 2)) {
    throw new Error(`unsupported chunk ${magic} v${version}`);
  }
  const ix = v.getInt32(8, true);
  const iy = v.getInt32(12, true);
  const tileSize = v.getInt32(16, true) / COORD_SCALE;
  const nNodes = v.getUint32(20, true);
  const nEdges = v.getUint32(24, true);
  const nGeom = v.getUint32(28, true);

  let pos = HEADER_SIZE;
  const nodeSize = version === 2 ? NODE_SIZE_V2 : NODE_SIZE_V1;
  const nodes: [number, number][] = new Array(nNodes);
  const heights: (number | null)[] = new Array(nNodes);
  const nodesE7: [number, number][] = new Array(nNodes);
  for (let i = 0; i < nNodes; i++, pos += nodeSize) {
    const lat = v.getInt32(pos, true);
    const lon = v.getInt32(pos + 4, true);
    nodesE7[i] = [lat, lon];
    nodes[i] = [lat / COORD_SCALE, lon / COORD_SCALE];
    const h = version === 2 ? v.getInt16(pos + 8, true) : HEIGHT_UNKNOWN;
    heights[i] = h === HEIGHT_UNKNOWN ? null : h / 10;
  }

  const geomStart = pos + nEdges * EDGE_SIZE;
  if (geomStart + nGeom !== bytes.byteLength) throw new Error('chunk length mismatch');

  const edges: ChunkEdge[] = new Array(nEdges);
  for (let i = 0; i < nEdges; i++, pos += EDGE_SIZE) {
    const fromIdx = v.getUint32(pos, true);
    const attrs = v.getUint8(pos + 14);
    const litCode = (attrs >> 3) & 0b11;
    const gcnt = v.getUint16(pos + 32, true);
    let gp = geomStart + v.getUint32(pos + 28, true);
    const start = nodesE7[fromIdx];
    if (!start) throw new RangeError(`edge ${i}: bad from index ${fromIdx}`);
    let [lat, lon] = start;
    const shape: [number, number][] = [];
    for (let k = 0; k < gcnt; k++) {
      let d: number;
      [d, gp] = readVarint(bytes, gp);
      lat += unzigzag(d);
      [d, gp] = readVarint(bytes, gp);
      lon += unzigzag(d);
      shape.push([lat / COORD_SCALE, lon / COORD_SCALE]);
    }
    const msf = v.getUint8(pos + 12);
    const msb = v.getUint8(pos + 13);
    edges[i] = {
      fromIdx,
      toIdx: v.getUint32(pos + 4, true),
      toTile: [ix + v.getInt8(pos + 8), iy + v.getInt8(pos + 9)],
      roadClass: v.getUint8(pos + 10),
      flags: v.getUint8(pos + 11),
      maxspeedFwd: msf || null,
      maxspeedBwd: msb || null,
      surface: attrs & 0b111,
      lit: litCode === 0 ? null : litCode === 2,
      cycleway: (attrs & 0b100000) !== 0,
      signals: v.getUint8(pos + 15),
      lengthM: v.getUint32(pos + 16, true) / 10,
      curvatureDeg: v.getUint16(pos + 20, true),
      ascentM: v.getUint16(pos + 22, true) / 10,
      descentM: v.getUint16(pos + 24, true) / 10,
      risk: v.getUint8(pos + 26),
      dtv: v.getUint16(pos + 34, true) * DTV_UNIT,
      shape,
    };
  }
  return { key: [ix, iy], tileSize, nodes, heights, edges };
}
