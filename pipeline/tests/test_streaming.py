from pathlib import Path

import numpy as np
import pytest

from mopedmaps_pipeline.graph import build_graph
from mopedmaps_pipeline.osm_pbf import read_osm
from mopedmaps_pipeline.streaming import junction_ids

FIX = Path(__file__).parent / "fixtures"
BREMEN = Path(__file__).resolve().parents[2] / "data" / "bremen-latest.osm.pbf"


@pytest.mark.parametrize("name", ["small.osm", "cross_tile.osm"])
def test_junctions_match_in_memory_build(name):
    path = FIX / name
    expected = sorted(build_graph(read_osm(path)).nodes)
    got = junction_ids(path)
    assert got.dtype == np.int64
    assert got.tolist() == expected


@pytest.mark.skipif(not BREMEN.exists(), reason="local Bremen extract missing")
def test_junctions_match_on_bremen():
    expected = np.array(sorted(build_graph(read_osm(BREMEN)).nodes), dtype=np.int64)
    got = junction_ids(BREMEN)
    # Ways with missing node locations are dropped by the in-memory build but
    # their nodes may still count here; allow only that kind of surplus.
    assert np.isin(expected, got).all()
    assert len(got) - len(expected) <= len(expected) * 0.001
