import numpy as np
import pytest

from mopedmaps_pipeline.chunks import decode_chunk, split_into_chunks
from mopedmaps_pipeline.elevation import apply_elevation, smooth_heights
from mopedmaps_pipeline.graph import build_graph
from mopedmaps_pipeline.osm_xml import read_osm_xml
from tests.test_graph import FIXTURE


class Ramp:
    """Elevation rises 10 m per 0.01° of longitude (~670 m at 53°N)."""

    def sample_many(self, lats, lons):
        return (np.asarray(lons) - 8.80) * 1000.0


class Nowhere:
    def sample_many(self, lats, lons):
        return np.full(len(lats), np.nan)


def test_smoothing_removes_noise_but_keeps_trend():
    # a chain 0-1-...-20, linear slope 1 m per node plus alternating ±2 m noise
    n = 21
    fr, to = np.arange(n - 1), np.arange(1, n)
    raw = np.array([i + (2 if i % 2 else -2) for i in range(n)], dtype=float)
    raw_up = np.maximum(np.diff(raw), 0).sum()
    z = smooth_heights(raw, fr, to)
    up = np.maximum(np.diff(z), 0).sum()
    assert raw_up == pytest.approx(50)  # noise inflates climbing
    assert 15 < up < 25  # close to the true 20 m
    assert z[n // 2] == pytest.approx(raw[n // 2] + 2, abs=1.5)


def test_unknown_and_isolated_nodes():
    z = smooth_heights(np.array([5.0, np.nan, 9.0, 1.0]), np.array([0, 1]), np.array([1, 2]))
    assert np.isnan(z[1])  # unknown stays unknown
    assert z[0] == 5.0  # only neighbour unknown -> unchanged
    assert z[3] == 1.0  # isolated
    assert smooth_heights(
        np.array([5.0, 9.0]), np.array([0]), np.array([1]), iterations=0
    ).tolist() == [5.0, 9.0]


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
