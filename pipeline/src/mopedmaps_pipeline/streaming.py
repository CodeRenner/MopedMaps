"""Streaming graph build for large extracts (all of Germany) with bounded memory.

Pass 1 (`junction_ids`): read only ways and collect every node reference of
routable ways in a compact int64 array; a node is a junction (edge endpoint)
if it is used twice or more, or is a way endpoint. This is exactly the split
rule of `graph.build_graph`, without holding OSM objects in memory.

Later passes stream edges into per-tile files (see docs/germany-build.md).
"""

import struct
from array import array
from collections import OrderedDict
from collections.abc import Iterator
from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np
import osmium

from mopedmaps_pipeline import config
from mopedmaps_pipeline import tags as t
from mopedmaps_pipeline.chunks import TileKey, encode_tile, tile_name, tile_of
from mopedmaps_pipeline.elevation import ElevationSource, edge_climbs, smooth_heights
from mopedmaps_pipeline.graph import Edge, split_way
from mopedmaps_pipeline.osm_pbf import KEEP_KEYS


def routable_tags(way: osmium.osm.Way) -> dict[str, str] | None:
    """Filtered tags if the way is routable for mopeds or mofas, else None."""
    if way.tags.get("highway") not in config.ROUTABLE_HIGHWAYS or len(way.nodes) < 2:
        return None
    tags = {tg.k: tg.v for tg in way.tags if tg.k in KEEP_KEYS}
    return tags if t.access_flags(tags) else None


def prefilter(src: Path, dst: Path) -> dict[str, int]:
    """Pass 0: write only routable ways, traffic-signal nodes and the nodes the
    ways reference (pyosmium BackReferenceWriter). Shrinks the input and,
    crucially, the on-disk node location index for country-sized extracts.
    """
    stats = {"ways": 0, "signals": 0}
    fp = osmium.FileProcessor(str(src)).with_filter(osmium.filter.KeyFilter("highway"))
    with osmium.BackReferenceWriter(str(dst), ref_src=str(src), overwrite=True) as writer:
        for obj in fp:
            if obj.is_way():
                if routable_tags(obj) is not None:
                    writer.add(obj)
                    stats["ways"] += 1
            elif obj.is_node() and obj.tags.get("highway") == "traffic_signals":
                writer.add(obj)
                stats["signals"] += 1
    return stats


def junction_ids(path: Path) -> np.ndarray:
    """Sorted unique ids of all junction nodes (pass 1, ways only)."""
    refs = array("q")
    fp = osmium.FileProcessor(str(path), osmium.osm.WAY).with_filter(
        osmium.filter.KeyFilter("highway")
    )
    for way in fp:
        if routable_tags(way) is None:
            continue
        nodes = way.nodes
        refs.extend(n.ref for n in nodes)
        refs.append(nodes[0].ref)  # endpoints always split
        refs.append(nodes[-1].ref)
    ids, counts = np.unique(np.frombuffer(refs, dtype=np.int64), return_counts=True)
    return ids[counts >= 2]


# --- Pass 2: edges into per-tile spool files ------------------------------------


_EDGE_HEAD = struct.Struct("<qqqdBHHBBb?dHI")  # fixed part of a spooled edge
_NODE_ROW = struct.Struct("<qdd")
_LIT = {None: -1, False: 0, True: 1}
_LIT_BACK = {-1: None, 0: False, 1: True}


def encode_edge(e: Edge) -> bytes:
    """Compact, lossless binary row (floats kept as float64 so tiles stay
    byte-identical). Ascent/descent are not spooled: they are added later."""
    head = _EDGE_HEAD.pack(
        e.from_node, e.to_node, e.way_id, e.length_m, int(e.road_class),
        e.maxspeed_fwd or 0, e.maxspeed_bwd or 0, int(e.flags), int(e.surface),
        _LIT[e.lit], e.cycleway, e.curvature_deg, e.signals, len(e.geometry),
    )  # fmt: skip
    coords = struct.pack(f"<{2 * len(e.geometry)}d", *(c for p in e.geometry for c in p))
    return head + coords


def _decode_edges(buf: bytes) -> list[Edge]:
    out = []
    pos = 0
    while pos < len(buf):
        (fr, to, way, length, rc, msf, msb, flags, surf, lit, cyc, curv, sig, n) = (
            _EDGE_HEAD.unpack_from(buf, pos)
        )
        pos += _EDGE_HEAD.size
        flat = struct.unpack_from(f"<{2 * n}d", buf, pos)
        pos += 16 * n
        out.append(
            Edge(
                from_node=fr,
                to_node=to,
                way_id=way,
                geometry=tuple(zip(flat[0::2], flat[1::2], strict=True)),
                length_m=length,
                road_class=t.RoadClass(rc),
                maxspeed_fwd=msf or None,
                maxspeed_bwd=msb or None,
                flags=t.AccessFlag(flags),
                surface=t.Surface(surf),
                lit=_LIT_BACK[lit],
                cycleway=cyc,
                curvature_deg=curv,
                signals=sig,
            )  # fmt: skip
        )
    return out


class TileSpool:
    """Buffered append-only binary spools, one file per (tile, kind).

    Kinds: "edges" (`encode_edge` rows) and "nodes" ((id, lat, lon) rows).
    Keeps at most `flush_every` rows in memory per tile and never more than
    one open file at a time, so it scales to ~1000 tiles.
    """

    def __init__(self, directory: Path, flush_every: int = 2000) -> None:
        self.directory = directory
        self.flush_every = flush_every
        self._buf: dict[tuple[str, TileKey], list[bytes]] = {}
        directory.mkdir(parents=True, exist_ok=True)

    def path(self, kind: str, key: TileKey) -> Path:
        return self.directory / f"{key[1]}_{key[0]}.{kind}.bin"

    def add(self, kind: str, key: TileKey, item: object) -> None:
        row = encode_edge(item) if kind == "edges" else _NODE_ROW.pack(*item)  # type: ignore[arg-type]
        buf = self._buf.setdefault((kind, key), [])
        buf.append(row)
        if len(buf) >= self.flush_every:
            self._flush(kind, key)

    def _flush(self, kind: str, key: TileKey) -> None:
        rows = self._buf.pop((kind, key), [])
        if rows:
            with self.path(kind, key).open("ab") as f:
                f.write(b"".join(rows))

    def close(self) -> None:
        for kind, key in list(self._buf):
            self._flush(kind, key)

    def tiles(self, kind: str) -> list[TileKey]:
        out = []
        for p in self.directory.glob(f"*.{kind}.bin"):
            iy, ix = p.name.split(".")[0].split("_")
            out.append((int(ix), int(iy)))
        return sorted(out)

    def read(self, kind: str, key: TileKey) -> list:
        p = self.path(kind, key)
        if not p.exists():
            return []
        buf = p.read_bytes()
        if kind == "edges":
            return _decode_edges(buf)
        return list(_NODE_ROW.iter_unpack(buf))

    def size_bytes(self) -> int:
        return sum(p.stat().st_size for p in self.directory.glob("*.bin"))


def stream_edges(
    path: Path,
    junctions: np.ndarray,
    spool: TileSpool,
    location_store: str = "flex_mem",
    tile_size: float = config.TILE_SIZE_DEG,
) -> dict[str, int]:
    """Pass 2: split routable ways at `junctions` and spool edges by from-tile.

    Spools: kind "edges" -> `Edge` objects; kind "nodes" -> (id, lat, lon) of
    every edge endpoint lying in that tile (deduplicated at assembly).
    `location_store` is a pyosmium index spec, e.g.
    "sparse_file_array,/tmp/nodes.idx" for country-sized extracts.
    """
    signals: set[int] = set()
    stats = {"ways": 0, "edges": 0, "skipped_incomplete": 0}

    def is_split(ref: int) -> bool:
        i = np.searchsorted(junctions, ref)
        return bool(i < len(junctions) and junctions[i] == ref)

    fp = (
        osmium.FileProcessor(str(path))
        .with_locations(location_store)
        .with_filter(osmium.filter.KeyFilter("highway"))
    )
    for obj in fp:
        if obj.is_node():
            if obj.tags.get("highway") == "traffic_signals":
                signals.add(obj.id)
            continue
        if not obj.is_way():
            continue
        tags = routable_tags(obj)
        if tags is None:
            continue
        refs: list[int] = []
        coords: list[tuple[float, float]] = []
        for n in obj.nodes:
            if not n.location.valid():
                break
            refs.append(n.ref)
            coords.append((n.location.lat, n.location.lon))
        else:
            stats["ways"] += 1
            for e in split_way(
                obj.id, refs, coords, tags, t.access_flags(tags), is_split, signals.__contains__
            ):
                key = tile_of(*e.geometry[0], tile_size)
                spool.add("edges", key, e)
                spool.add("nodes", key, (e.from_node, *e.geometry[0]))
                to_key = tile_of(*e.geometry[-1], tile_size)
                spool.add("nodes", to_key, (e.to_node, *e.geometry[-1]))
                stats["edges"] += 1
            continue
        stats["skipped_incomplete"] += 1
    spool.close()
    return stats


# --- Pass 3: assemble .mmg tiles from the spools ---------------------------------


@dataclass(frozen=True)
class TileInfo:
    key: TileKey
    name: str
    data: bytes
    nodes: int
    edges: int


class _NodeIndex:
    """Per-tile sorted junction ids, loaded lazily with a small LRU cache."""

    def __init__(self, spool: TileSpool, capacity: int = 64) -> None:
        self.spool = spool
        self.capacity = capacity
        self._cache: OrderedDict[TileKey, tuple[np.ndarray, dict[int, tuple[float, float]]]] = (
            OrderedDict()
        )

    def get(self, key: TileKey) -> tuple[np.ndarray, dict[int, tuple[float, float]]]:
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        coords = {nid: (lat, lon) for nid, lat, lon in self.spool.read("nodes", key)}
        ids = np.array(sorted(coords), dtype=np.int64)
        self._cache[key] = (ids, coords)
        if len(self._cache) > self.capacity:
            self._cache.popitem(last=False)
        return ids, coords

    def local_index(self, key: TileKey, nid: int) -> int:
        ids, _ = self.get(key)
        i = int(np.searchsorted(ids, nid))
        if i >= len(ids) or ids[i] != nid:
            raise KeyError(f"node {nid} missing from tile {key}")
        return i


def assemble(
    spool: TileSpool,
    tile_size: float = config.TILE_SIZE_DEG,
    heights: tuple[np.ndarray, np.ndarray] | None = None,
) -> Iterator[TileInfo]:
    """Pass 3: yield encoded tiles one by one (bounded memory).

    With `heights` (from `stream_heights`) edges get ascent/descent like the
    in-memory `apply_elevation`.
    """
    index = _NodeIndex(spool)
    for key in spool.tiles("nodes"):
        ids, coords = index.get(key)
        edges: list[Edge] = spool.read("edges", key)
        if heights is not None and edges:
            up, down = edge_climbs(
                heights[0],
                heights[1],
                np.array([e.from_node for e in edges], dtype=np.int64),
                np.array([e.to_node for e in edges], dtype=np.int64),
            )
            edges = [
                e if np.isnan(a) else replace(e, ascent_m=float(a), descent_m=float(d))
                for e, a, d in zip(edges, up, down, strict=True)
            ]
        # Tile of a node = tile of its coordinates; the edge geometry carries
        # both endpoints, so no global node->tile map is needed.
        endpoint_tile: dict[int, TileKey] = {}
        for e in edges:
            endpoint_tile[e.from_node] = key
            endpoint_tile[e.to_node] = tile_of(*e.geometry[-1], tile_size)

        def locate(nid: int, tiles: dict[int, TileKey] = endpoint_tile) -> tuple[TileKey, int]:
            k = tiles[nid]
            return k, index.local_index(k, nid)

        data = encode_tile(key, tile_size, [coords[int(n)] for n in ids], edges, locate)
        yield TileInfo(key, tile_name(key), data, len(ids), len(edges))


# --- Elevation for the streaming build ----------------------------------------------


def stream_heights(spool: TileSpool, dem: ElevationSource) -> tuple[np.ndarray, np.ndarray]:
    """Smoothed junction heights (sorted ids, heights) for the whole spool.

    Holds only numpy arrays: ids/heights per junction and one (from, to) pair
    per edge — under 1 GB for Germany.
    """
    nid_buf = array("q")
    lat_buf = array("d")
    lon_buf = array("d")
    for key in spool.tiles("nodes"):
        for nid, lat, lon in spool.read("nodes", key):
            nid_buf.append(nid)
            lat_buf.append(lat)
            lon_buf.append(lon)
    ids, first = np.unique(np.frombuffer(nid_buf, dtype=np.int64), return_index=True)
    lats = np.frombuffer(lat_buf, dtype=np.float64)[first]
    lons = np.frombuffer(lon_buf, dtype=np.float64)[first]
    del nid_buf, lat_buf, lon_buf
    raw = dem.sample_many(lats, lons)
    fr_ids = array("q")
    to_ids = array("q")
    for key in spool.tiles("edges"):
        for e in spool.read("edges", key):
            fr_ids.append(e.from_node)
            to_ids.append(e.to_node)
    fr = np.searchsorted(ids, np.frombuffer(fr_ids, dtype=np.int64))
    to = np.searchsorted(ids, np.frombuffer(to_ids, dtype=np.int64))
    return ids, smooth_heights(raw, fr, to)
