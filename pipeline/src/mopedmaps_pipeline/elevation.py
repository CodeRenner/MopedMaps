"""Per-edge ascent/descent from a DEM (roadmap step 6).

Heights are sampled at junction nodes and smoothed over the graph (Laplacian
smoothing) to suppress surface-model noise from buildings and trees; an
edge's ascent/descent is then the difference of its smoothed end heights.
Because node heights are shared, climbs along a route telescope correctly.

Known limitation: a hill in the middle of a long edge whose ends are at
similar heights is not captured (rare: edges split at every junction).
"""

import math
from collections import defaultdict
from dataclasses import replace
from typing import Protocol

from mopedmaps_pipeline import config
from mopedmaps_pipeline.graph import Edge, Graph


class ElevationSource(Protocol):
    def elevation(self, lat: float, lon: float) -> float: ...


def smooth_node_heights(
    heights: dict[int, float],
    neighbours: dict[int, list[int]],
    iterations: int = config.ELEVATION_SMOOTHING_ITERATIONS,
    alpha: float = config.ELEVATION_SMOOTHING_ALPHA,
) -> dict[int, float]:
    """Laplacian smoothing; nodes without known neighbours keep their height."""
    z = dict(heights)
    for _ in range(iterations):
        nz = {}
        for n, h in z.items():
            ns = [z[m] for m in neighbours.get(n, ()) if m in z]
            nz[n] = (1 - alpha) * h + alpha * sum(ns) / len(ns) if ns else h
        z = nz
    return z


def apply_elevation(graph: Graph, dem: ElevationSource) -> tuple[Graph, int]:
    """Return a graph with ascent/descent filled in, plus the count of edges without DEM data."""
    raw = {n: dem.elevation(lat, lon) for n, (lat, lon) in graph.nodes.items()}
    known = {n: h for n, h in raw.items() if not math.isnan(h)}
    neighbours: dict[int, list[int]] = defaultdict(list)
    for e in graph.edges:
        neighbours[e.from_node].append(e.to_node)
        neighbours[e.to_node].append(e.from_node)
    z = smooth_node_heights(known, neighbours)

    edges: list[Edge] = []
    missing = 0
    for e in graph.edges:
        if e.from_node not in z or e.to_node not in z:
            missing += 1
            edges.append(e)
            continue
        dz = z[e.to_node] - z[e.from_node]
        edges.append(replace(e, ascent_m=max(0.0, dz), descent_m=max(0.0, -dz)))
    return Graph(nodes=graph.nodes, edges=edges), missing
