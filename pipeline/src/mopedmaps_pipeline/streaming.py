"""Streaming graph build for large extracts (all of Germany) with bounded memory.

Pass 1 (`junction_ids`): read only ways and collect every node reference of
routable ways in a compact int64 array; a node is a junction (edge endpoint)
if it is used twice or more, or is a way endpoint. This is exactly the split
rule of `graph.build_graph`, without holding OSM objects in memory.

Later passes stream edges into per-tile files (see docs/germany-build.md).
"""

from array import array
from pathlib import Path

import numpy as np
import osmium

from mopedmaps_pipeline import config
from mopedmaps_pipeline import tags as t
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
