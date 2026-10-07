"""Streaming graph build for large extracts (all of Germany) with bounded memory.

Pass 1 (`junction_ids`): read only ways and collect every node reference of
routable ways in a compact int64 array; a node is a junction (edge endpoint)
if it is used twice or more, or is a way endpoint. This is exactly the split
rule of `graph.build_graph`, without holding OSM objects in memory.

Later passes stream edges into per-tile files (see docs/germany-build.md).
"""

import pickle
from array import array
from pathlib import Path

import numpy as np
import osmium

from mopedmaps_pipeline import config
from mopedmaps_pipeline import tags as t
from mopedmaps_pipeline.chunks import TileKey, tile_of
from mopedmaps_pipeline.graph import split_way
from mopedmaps_pipeline.osm_pbf import KEEP_KEYS


def routable_tags(way: osmium.osm.Way) -> dict[str, str] | None:
    """Filtered tags if the way is routable for mopeds or mofas, else None."""
    if way.tags.get("highway") not in config.ROUTABLE_HIGHWAYS or len(way.nodes) < 2:
        return None
    tags = {tg.k: tg.v for tg in way.tags if tg.k in KEEP_KEYS}
    return tags if t.access_flags(tags) else None


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


class TileSpool:
    """Buffered append-only pickle spools, one file per (tile, kind).

    Keeps at most `flush_every` items in memory per tile and never more than
    one open file at a time, so it scales to ~1000 tiles.
    """

    def __init__(self, directory: Path, flush_every: int = 2000) -> None:
        self.directory = directory
        self.flush_every = flush_every
        self._buf: dict[tuple[str, TileKey], list] = {}
        directory.mkdir(parents=True, exist_ok=True)

    def path(self, kind: str, key: TileKey) -> Path:
        return self.directory / f"{key[1]}_{key[0]}.{kind}.pkl"

    def add(self, kind: str, key: TileKey, item: object) -> None:
        buf = self._buf.setdefault((kind, key), [])
        buf.append(item)
        if len(buf) >= self.flush_every:
            self._flush(kind, key)

    def _flush(self, kind: str, key: TileKey) -> None:
        items = self._buf.pop((kind, key), [])
        if items:
            with self.path(kind, key).open("ab") as f:
                pickle.dump(items, f, protocol=pickle.HIGHEST_PROTOCOL)

    def close(self) -> None:
        for kind, key in list(self._buf):
            self._flush(kind, key)

    def tiles(self, kind: str) -> list[TileKey]:
        out = []
        for p in self.directory.glob(f"*.{kind}.pkl"):
            iy, ix = p.name.split(".")[0].split("_")
            out.append((int(ix), int(iy)))
        return sorted(out)

    def read(self, kind: str, key: TileKey) -> list:
        items: list = []
        p = self.path(kind, key)
        if not p.exists():
            return items
        with p.open("rb") as f:
            while True:
                try:
                    items.extend(pickle.load(f))
                except EOFError:
                    return items


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
