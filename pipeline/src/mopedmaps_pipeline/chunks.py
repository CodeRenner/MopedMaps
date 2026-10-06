"""Spatial tiling and the binary chunk format (see docs/chunk-format.md).

A chunk holds the junction nodes located inside one grid tile and all edges
whose *from* node lies in that tile. Nodes are addressed tile-locally as
``(tile, index)``; an edge points to its *to* node via a relative tile offset
plus index, which keeps records small and lets the client merge any set of
loaded tiles into one graph.
"""

import math
import struct
from dataclasses import dataclass, field

from mopedmaps_pipeline import config
from mopedmaps_pipeline import tags as t
from mopedmaps_pipeline.graph import Edge, Graph

MAGIC = b"MMG1"
VERSION = 1
COORD_SCALE = 10_000_000  # degrees -> int32 (1e-7 deg, ~1 cm)

HEADER = struct.Struct("<4sHHiiiIII")  # 32 bytes
NODE = struct.Struct("<ii")  # lat_e7, lon_e7
EDGE = struct.Struct("<IIbbBBBBBBIHHHBBIHH")  # 36 bytes

TileKey = tuple[int, int]  # (ix, iy) = (lon index, lat index)


def tile_of(lat: float, lon: float, size: float = config.TILE_SIZE_DEG) -> TileKey:
    return math.floor(lon / size), math.floor(lat / size)


def tile_name(key: TileKey) -> str:
    return f"{key[1]}_{key[0]}.mmg"  # lat-index_lon-index


@dataclass
class DecodedEdge:
    from_idx: int
    to_tile: TileKey
    to_idx: int
    road_class: t.RoadClass
    flags: t.AccessFlag
    maxspeed_fwd: int | None
    maxspeed_bwd: int | None
    surface: t.Surface
    lit: bool | None
    cycleway: bool
    signals: int
    length_m: float
    curvature_deg: int
    ascent_m: float
    descent_m: float
    risk: int
    shape: list[tuple[float, float]]  # intermediate points only


@dataclass
class Chunk:
    key: TileKey
    tile_size: float
    nodes: list[tuple[float, float]] = field(default_factory=list)
    edges: list[DecodedEdge] = field(default_factory=list)


# --- varint helpers -----------------------------------------------------------


def _zigzag(n: int) -> int:
    return (n << 1) ^ (n >> 63)


def _unzigzag(n: int) -> int:
    return (n >> 1) ^ -(n & 1)


def _write_varint(out: bytearray, n: int) -> None:
    while n >= 0x80:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    out.append(n)


def _read_varint(buf: bytes, pos: int) -> tuple[int, int]:
    n = shift = 0
    while True:
        b = buf[pos]
        pos += 1
        n |= (b & 0x7F) << shift
        if b < 0x80:
            return n, pos
        shift += 7


def _e7(v: float) -> int:
    return round(v * COORD_SCALE)


# --- encoding -----------------------------------------------------------------


def _lit_code(v: bool | None) -> int:
    return 0 if v is None else (2 if v else 1)


def _speed(v: int | None) -> int:
    return 0 if v is None else min(v, 254)


def split_into_chunks(graph: Graph, size: float = config.TILE_SIZE_DEG) -> dict[TileKey, bytes]:
    """Assign nodes/edges to tiles and encode each tile as bytes."""
    node_tile: dict[int, TileKey] = {}
    tile_nodes: dict[TileKey, list[int]] = {}
    for nid in sorted(graph.nodes):
        key = tile_of(*graph.nodes[nid], size)
        node_tile[nid] = key
        tile_nodes.setdefault(key, []).append(nid)
    local_idx = {nid: i for nodes in tile_nodes.values() for i, nid in enumerate(nodes)}

    tile_edges: dict[TileKey, list[Edge]] = {k: [] for k in tile_nodes}
    for e in graph.edges:
        tile_edges[node_tile[e.from_node]].append(e)

    out = {}
    for key, nids in tile_nodes.items():
        geom = bytearray()
        edge_bytes = bytearray()
        for e in tile_edges[key]:
            to_key = node_tile[e.to_node]
            dx, dy = to_key[0] - key[0], to_key[1] - key[1]
            if not (-128 <= dx <= 127 and -128 <= dy <= 127):
                raise ValueError(f"edge {e.way_id} spans too many tiles")
            offset = len(geom)
            prev = (_e7(e.geometry[0][0]), _e7(e.geometry[0][1]))
            for lat, lon in e.geometry[1:-1]:
                cur = (_e7(lat), _e7(lon))
                _write_varint(geom, _zigzag(cur[0] - prev[0]))
                _write_varint(geom, _zigzag(cur[1] - prev[1]))
                prev = cur
            attrs = int(e.surface) | (_lit_code(e.lit) << 3) | (int(e.cycleway) << 5)
            edge_bytes += EDGE.pack(
                local_idx[e.from_node],
                local_idx[e.to_node],
                dx,
                dy,
                int(e.road_class),
                int(e.flags),
                _speed(e.maxspeed_fwd),
                _speed(e.maxspeed_bwd),
                attrs,
                min(e.signals, 255),
                round(e.length_m * 10),  # decimetres
                min(round(e.curvature_deg), 0xFFFF),
                0,  # ascent_dm  (reserved, roadmap step 6)
                0,  # descent_dm (reserved, roadmap step 6)
                0,  # risk       (reserved, roadmap step 5)
                0,  # reserved
                offset,
                len(e.geometry) - 2,
                0,  # reserved
            )
        header = HEADER.pack(
            MAGIC,
            VERSION,
            0,
            key[0],
            key[1],
            _e7(size),
            len(nids),
            len(tile_edges[key]),
            len(geom),
        )
        nodes = b"".join(NODE.pack(*map(_e7, graph.nodes[n])) for n in nids)
        out[key] = header + nodes + bytes(edge_bytes) + bytes(geom)
    return out


# --- decoding (reference implementation, mirrors the JS client) ---------------


def decode_chunk(buf: bytes) -> Chunk:
    magic, version, _, ix, iy, size_e7, n_nodes, n_edges, n_geom = HEADER.unpack_from(buf, 0)
    if magic != MAGIC or version != VERSION:
        raise ValueError(f"unsupported chunk {magic!r} v{version}")
    chunk = Chunk(key=(ix, iy), tile_size=size_e7 / COORD_SCALE)
    pos = HEADER.size
    for _ in range(n_nodes):
        lat, lon = NODE.unpack_from(buf, pos)
        chunk.nodes.append((lat / COORD_SCALE, lon / COORD_SCALE))
        pos += NODE.size
    geom_start = pos + n_edges * EDGE.size
    for _ in range(n_edges):
        r = EDGE.unpack_from(buf, pos)
        pos += EDGE.size
        (fi, ti, dx, dy, rc, fl, msf, msb, attrs, sig, len_dm, curv, asc, desc, risk, _,
         goff, gcnt, _) = r  # fmt: skip
        shape = []
        lat, lon = (_e7(c) for c in chunk.nodes[fi])
        gp = geom_start + goff
        for _ in range(gcnt):
            d, gp = _read_varint(buf, gp)
            lat += _unzigzag(d)
            d, gp = _read_varint(buf, gp)
            lon += _unzigzag(d)
            shape.append((lat / COORD_SCALE, lon / COORD_SCALE))
        lit_code = (attrs >> 3) & 0b11
        chunk.edges.append(
            DecodedEdge(
                from_idx=fi,
                to_tile=(ix + dx, iy + dy),
                to_idx=ti,
                road_class=t.RoadClass(rc),
                flags=t.AccessFlag(fl),
                maxspeed_fwd=msf or None,
                maxspeed_bwd=msb or None,
                surface=t.Surface(attrs & 0b111),
                lit=None if lit_code == 0 else lit_code == 2,
                cycleway=bool(attrs & 0b100000),
                signals=sig,
                length_m=len_dm / 10,
                curvature_deg=curv,
                ascent_m=asc / 10,
                descent_m=desc / 10,
                risk=risk,
                shape=shape,
            )
        )
    if geom_start + n_geom != len(buf):
        raise ValueError("chunk length mismatch")
    return chunk
