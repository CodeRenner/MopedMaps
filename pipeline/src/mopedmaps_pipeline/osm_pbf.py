"""Read .osm.pbf (or .osm) extracts with pyosmium (BSD-2) into ``OsmData``.

Only routable ways and the tags the pipeline uses are kept, and node
coordinates are resolved by osmium's location index, so memory scales with
the road network rather than the whole extract.
"""

from pathlib import Path

import osmium

from mopedmaps_pipeline import config
from mopedmaps_pipeline.osm_xml import OsmData, Way

# Tags the graph builder actually reads; everything else is dropped early.
KEEP_KEYS = frozenset(
    {
        "highway",
        "ref",
        "area",
        "junction",
        "access",
        "vehicle",
        "motor_vehicle",
        "moped",
        "mofa",
        "motorroad",
        "oneway",
        "oneway:moped",
        "oneway:mofa",
        "maxspeed",
        "maxspeed:forward",
        "maxspeed:backward",
        "surface",
        "lit",
        "cycleway",
        "cycleway:both",
        "cycleway:left",
        "cycleway:right",
    }
)


class _Handler(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.data = OsmData()

    def node(self, n: osmium.osm.Node) -> None:
        if n.tags.get("highway") == "traffic_signals":
            self.data.node_tags[n.id] = {"highway": "traffic_signals"}

    def way(self, w: osmium.osm.Way) -> None:
        if w.tags.get("highway") not in config.ROUTABLE_HIGHWAYS:
            return
        refs = []
        coords = []
        for nd in w.nodes:
            if not nd.location.valid():
                return  # incomplete way at the extract border
            refs.append(nd.ref)
            coords.append((nd.location.lat, nd.location.lon))
        self.data.nodes.update(zip(refs, coords, strict=True))
        tags = {t.k: t.v for t in w.tags if t.k in KEEP_KEYS}
        self.data.ways.append(Way(w.id, tuple(refs), tags))


def read_osm(path: Path) -> OsmData:
    h = _Handler()
    h.apply_file(str(path), locations=True, idx="flex_mem")
    # Drop signal tags for nodes not on any routable way.
    h.data.node_tags = {k: v for k, v in h.data.node_tags.items() if k in h.data.nodes}
    return h.data
