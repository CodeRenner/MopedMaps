import math

import pytest

from mopedmaps_pipeline.chunks import decode_chunk, split_into_chunks
from mopedmaps_pipeline.elevation import apply_elevation, smooth_node_heights
from mopedmaps_pipeline.graph import build_graph
from mopedmaps_pipeline.osm_xml import read_osm_xml
from tests.test_graph import FIXTURE


class Ramp:
    """Elevation rises 10 m per 0.01° of longitude (~670 m at 53°N)."""

    def elevation(self, lat, lon):
        return (lon - 8.80) * 1000.0


class Nowhere:
    def elevation(self, lat, lon):
        return math.nan


def test_smoothing_removes_noise_but_keeps_trend():
    # a chain 0-1-2-...-20, linear slope 1 m per node plus alternating ±2 m noise
    n = 21
    nb = {i: [j for j in (i - 1, i + 1) if 0 <= j < n] for i in range(n)}
    raw = {i: i + (2 if i % 2 else -2) for i in range(n)}
    raw_up = sum(max(0, raw[i + 1] - raw[i]) for i in range(n - 1))
    z = smooth_node_heights(raw, nb)
    up = sum(max(0, z[i + 1] - z[i]) for i in range(n - 1))
    assert raw_up == pytest.approx(50)  # noise inflates climbing
    assert 15 < up < 25  # close to the true 20 m
    assert z[n // 2] == pytest.approx(raw[n // 2] + 2, abs=1.5)


def test_isolated_nodes_and_zero_iterations():
    assert smooth_node_heights({1: 5.0}, {}) == {1: 5.0}
    assert smooth_node_heights({1: 5.0, 2: 9.0}, {1: [2], 2: [1]}, iterations=0) == {1: 5.0, 2: 9.0}


def test_apply_and_encode_direction():
    g = build_graph(read_osm_xml(FIXTURE))
    g2, missing = apply_elevation(g, Ramp())
    assert missing == 0
    e12 = next(e for e in g2.edges if (e.from_node, e.to_node) == (1, 2))
    assert e12.ascent_m > 0 and e12.descent_m == 0
    c = decode_chunk(split_into_chunks(g2)[(35, 212)])
    for d in c.edges:
        assert d.ascent_m == 0 or d.descent_m == 0
    _, missing = apply_elevation(g, Nowhere())
    assert missing == len(g.edges)
