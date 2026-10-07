"""Minimal OSM XML reader (stdlib only), used for small fixtures and tests.

Real extracts (.osm.pbf) are read by a separate adapter; both produce the
same ``OsmData`` so the graph builder does not care about the format.
"""

import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

from mopedmaps_pipeline.tags import Tags


@dataclass(frozen=True)
class Way:
    id: int
    refs: tuple[int, ...]
    tags: Tags


@dataclass
class OsmData:
    nodes: dict[int, tuple[float, float]] = field(default_factory=dict)  # id -> (lat, lon)
    node_tags: dict[int, Tags] = field(default_factory=dict)  # only nodes with tags
    ways: list[Way] = field(default_factory=list)


def _tags(el: ET.Element) -> Tags:
    return {t.attrib["k"]: t.attrib["v"] for t in el.findall("tag")}


def read_osm_xml(path: Path) -> OsmData:
    root = ET.parse(path).getroot()
    data = OsmData()
    for n in root.findall("node"):
        nid = int(n.attrib["id"])
        data.nodes[nid] = (float(n.attrib["lat"]), float(n.attrib["lon"]))
        if tags := _tags(n):
            data.node_tags[nid] = tags
    for w in root.findall("way"):
        refs = tuple(int(nd.attrib["ref"]) for nd in w.findall("nd"))
        data.ways.append(Way(int(w.attrib["id"]), refs, _tags(w)))
    return data
