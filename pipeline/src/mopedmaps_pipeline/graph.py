"""Build a routing graph with raw edge attributes from OSM data.

Ways are split at every node shared by two or more routable ways (junctions)
and at their endpoints. Each resulting edge stores only raw facts; travel time
and energy are computed by the router from the runtime vehicle profile.
"""

from collections import Counter
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass, field

from mopedmaps_pipeline import tags as t
from mopedmaps_pipeline.geo import bearing_deg, haversine_m, turn_deg
from mopedmaps_pipeline.osm_xml import OsmData, Way
from mopedmaps_pipeline.traffic import TrafficIndex


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
    ascent_m: float = 0.0  # climb along from -> to (filled by elevation.py)
    descent_m: float = 0.0  # drop along from -> to
    dtv: int = 0  # traffic volume, vehicles/day (traffic.py); 0 = unknown


@dataclass
class Graph:
    nodes: dict[int, tuple[float, float]]  # junction id -> (lat, lon)
    edges: list[Edge]
    heights: dict[int, float] = field(default_factory=dict)  # smoothed metres, if DEM used


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


def split_way(
    way_id: int,
    refs: Sequence[int],
    coords: Sequence[tuple[float, float]],
    tags: t.Tags,
    flags: t.AccessFlag,
    is_split: Callable[[int], bool],
    is_signal: Callable[[int], bool],
    traffic: TrafficIndex | None = None,
) -> Iterator[Edge]:
    """Split one routable way into edges at junction nodes (shared by the
    in-memory and the streaming build so both produce identical edges)."""
    rc = t.road_class(tags)
    assert rc is not None
    ms_fwd = t.maxspeed_for_direction(tags, forward=True)
    ms_bwd = t.maxspeed_for_direction(tags, forward=False)
    surface, lit, cycleway = t.surface(tags), t.lit(tags), t.has_cycleway(tags)
    start = 0
    last = len(refs) - 1
    for i in range(1, len(refs)):
        if i != last and not is_split(refs[i]):
            continue
        seg = refs[start : i + 1]
        geom = list(coords[start : i + 1])
        start = i
        if seg[0] == seg[-1] and len(seg) == 2:
            continue  # degenerate self-loop from duplicate node
        yield Edge(
            from_node=seg[0],
            to_node=seg[-1],
            way_id=way_id,
            geometry=tuple(geom),
            length_m=sum(haversine_m(a, b) for a, b in zip(geom, geom[1:], strict=False)),
            road_class=rc,
            maxspeed_fwd=ms_fwd,
            maxspeed_bwd=ms_bwd,
            flags=flags,
            surface=surface,
            lit=lit,
            cycleway=cycleway,
            curvature_deg=_curvature(geom),
            signals=sum(1 for r in seg[1:] if is_signal(r)),
            dtv=traffic.dtv(tags.get("ref"), *geom[len(geom) // 2]) if traffic else 0,
        )


def build_graph(data: OsmData, traffic: TrafficIndex | None = None) -> Graph:
    ways = _routable(data)
    usage: Counter[int] = Counter()
    for w, _ in ways:
        usage.update(w.refs)
        usage[w.refs[0]] += 1  # endpoints are always split points
        usage[w.refs[-1]] += 1

    edges: list[Edge] = []
    for w, flags in ways:
        edges.extend(
            split_way(
                w.id,
                w.refs,
                [data.nodes[r] for r in w.refs],
                w.tags,
                flags,
                is_split=lambda r: usage[r] >= 2,
                is_signal=lambda r: data.node_tags.get(r, {}).get("highway") == "traffic_signals",
                traffic=traffic,
            )
        )

    junctions = {e.from_node for e in edges} | {e.to_node for e in edges}
    return Graph(nodes={n: data.nodes[n] for n in junctions}, edges=edges)
