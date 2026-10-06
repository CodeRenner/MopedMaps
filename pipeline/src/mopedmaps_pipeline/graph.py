"""Build a routing graph with raw edge attributes from OSM data.

Ways are split at every node shared by two or more routable ways (junctions)
and at their endpoints. Each resulting edge stores only raw facts; travel time
and energy are computed by the router from the runtime vehicle profile.
"""

from collections import Counter
from dataclasses import dataclass

from mopedmaps_pipeline import tags as t
from mopedmaps_pipeline.geo import bearing_deg, haversine_m, turn_deg
from mopedmaps_pipeline.osm_xml import OsmData, Way


@dataclass(frozen=True)
class Edge:
    from_node: int  # OSM node id of the start junction
    to_node: int  # OSM node id of the end junction
    way_id: int
    geometry: tuple[tuple[float, float], ...]  # (lat, lon), from -> to
    length_m: float
    road_class: t.RoadClass
    maxspeed_fwd: int | None  # raw km/h, None = unknown
    maxspeed_bwd: int | None
    flags: t.AccessFlag
    surface: t.Surface
    lit: bool | None
    cycleway: bool
    curvature_deg: float  # sum of heading changes along the geometry
    signals: int  # traffic signals on the edge, excluding the start node


@dataclass
class Graph:
    nodes: dict[int, tuple[float, float]]  # junction id -> (lat, lon)
    edges: list[Edge]


def _routable(data: OsmData) -> list[tuple[Way, t.AccessFlag]]:
    out = []
    for w in data.ways:
        if len(w.refs) < 2:
            continue
        flags = t.access_flags(w.tags)
        if flags and all(r in data.nodes for r in w.refs):
            out.append((w, flags))
    return out


def _curvature(geom: list[tuple[float, float]]) -> float:
    bearings = [bearing_deg(a, b) for a, b in zip(geom, geom[1:], strict=False) if a != b]
    return sum(turn_deg(b1, b2) for b1, b2 in zip(bearings, bearings[1:], strict=False))


def build_graph(data: OsmData) -> Graph:
    ways = _routable(data)
    usage: Counter[int] = Counter()
    for w, _ in ways:
        usage.update(w.refs)
        usage[w.refs[0]] += 1  # endpoints are always split points
        usage[w.refs[-1]] += 1

    edges: list[Edge] = []
    for w, flags in ways:
        start = 0
        for i in range(1, len(w.refs)):
            if usage[w.refs[i]] < 2 and i != len(w.refs) - 1:
                continue
            refs = w.refs[start : i + 1]
            start = i
            if refs[0] == refs[-1] and len(refs) == 2:
                continue  # degenerate self-loop from duplicate node
            geom = [data.nodes[r] for r in refs]
            edges.append(
                Edge(
                    from_node=refs[0],
                    to_node=refs[-1],
                    way_id=w.id,
                    geometry=tuple(geom),
                    length_m=sum(haversine_m(a, b) for a, b in zip(geom, geom[1:], strict=False)),
                    road_class=t.road_class(w.tags),  # type: ignore[arg-type]
                    maxspeed_fwd=t.maxspeed_for_direction(w.tags, forward=True),
                    maxspeed_bwd=t.maxspeed_for_direction(w.tags, forward=False),
                    flags=flags,
                    surface=t.surface(w.tags),
                    lit=t.lit(w.tags),
                    cycleway=t.has_cycleway(w.tags),
                    curvature_deg=_curvature(geom),
                    signals=sum(
                        1
                        for r in refs[1:]
                        if data.node_tags.get(r, {}).get("highway") == "traffic_signals"
                    ),
                )
            )

    junctions = {e.from_node for e in edges} | {e.to_node for e in edges}
    return Graph(nodes={n: data.nodes[n] for n in junctions}, edges=edges)
