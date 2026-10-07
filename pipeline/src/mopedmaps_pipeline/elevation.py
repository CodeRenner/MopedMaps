"""Per-edge ascent/descent from a DEM (roadmap step 6).

Heights are sampled at junction nodes and smoothed over the graph (Laplacian
smoothing) to suppress surface-model noise from buildings and trees; an
edge's ascent/descent is then the difference of its smoothed end heights.
Because node heights are shared, climbs along a route telescope correctly.

Known limitation: a hill in the middle of a long edge whose ends are at
similar heights is not captured (rare: edges split at every junction).
"""

from dataclasses import replace
from typing import Protocol

import numpy as np

from mopedmaps_pipeline import config
from mopedmaps_pipeline.graph import Edge, Graph


class ElevationSource(Protocol):
    def sample_many(self, lats: np.ndarray, lons: np.ndarray) -> np.ndarray: ...


def smooth_heights(
    z: np.ndarray,
    fr: np.ndarray,
    to: np.ndarray,
    iterations: int = config.ELEVATION_SMOOTHING_ITERATIONS,
    alpha: float = config.ELEVATION_SMOOTHING_ALPHA,
) -> np.ndarray:
    """Vectorised Laplacian (Jacobi) smoothing on a graph.

    `z` holds one height per node (NaN = unknown), `fr`/`to` are edge endpoint
    indices into `z` (each edge links both ways; parallel edges count twice).
    Unknown nodes stay NaN and are ignored as neighbours; nodes without known
    neighbours keep their height. Memory is O(nodes + edges), so this also
    runs for all of Germany.
    """
    z = z.astype(np.float64, copy=True)
    n = len(z)
    for _ in range(iterations):
        known = ~np.isnan(z)
        zk = np.where(known, z, 0.0)
        s = np.bincount(fr, weights=zk[to], minlength=n) + np.bincount(
            to, weights=zk[fr], minlength=n
        )
        c = np.bincount(fr, weights=known[to], minlength=n) + np.bincount(
            to, weights=known[fr], minlength=n
        )
        upd = known & (c > 0)
        z[upd] = (1 - alpha) * z[upd] + alpha * s[upd] / c[upd]
    return z


def edge_climbs(
    ids: np.ndarray, z: np.ndarray, from_ids: np.ndarray, to_ids: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """(ascent, descent) per edge from smoothed node heights; NaN if unknown."""
    dz = z[np.searchsorted(ids, to_ids)] - z[np.searchsorted(ids, from_ids)]
    return np.maximum(dz, 0.0), np.maximum(-dz, 0.0)


def apply_elevation(graph: Graph, dem: ElevationSource) -> tuple[Graph, int]:
    """Return a graph with ascent/descent filled in, plus the count of edges without DEM data."""
    ids = np.array(sorted(graph.nodes), dtype=np.int64)
    coords = np.array([graph.nodes[int(n)] for n in ids], dtype=np.float64).reshape(-1, 2)
    raw = dem.sample_many(coords[:, 0], coords[:, 1])
    from_ids = np.array([e.from_node for e in graph.edges], dtype=np.int64)
    to_ids = np.array([e.to_node for e in graph.edges], dtype=np.int64)
    z = smooth_heights(raw, np.searchsorted(ids, from_ids), np.searchsorted(ids, to_ids))
    up, down = edge_climbs(ids, z, from_ids, to_ids)
    edges: list[Edge] = []
    missing = 0
    for e, a, d in zip(graph.edges, up, down, strict=True):
        if np.isnan(a):
            missing += 1
            edges.append(e)
        else:
            edges.append(replace(e, ascent_m=float(a), descent_m=float(d)))
    return Graph(nodes=graph.nodes, edges=edges), missing
