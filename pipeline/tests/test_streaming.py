from pathlib import Path

import numpy as np
import pytest

from mopedmaps_pipeline.chunks import split_into_chunks, tile_of
from mopedmaps_pipeline.dem import Dem
from mopedmaps_pipeline.elevation import apply_elevation
from mopedmaps_pipeline.graph import build_graph
from mopedmaps_pipeline.osm_pbf import read_osm
from mopedmaps_pipeline.streaming import (
    TileSpool,
    assemble,
    junction_ids,
    prefilter,
    stream_edges,
    stream_heights,
)

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


def _edge_key(e):
    return (e.way_id, e.from_node, e.to_node)


def _stream(path, tmp_path):
    spool = TileSpool(tmp_path / "spool", flush_every=3)  # tiny buffer: exercise flushing
    stats = stream_edges(path, junction_ids(path), spool)
    edges = [e for key in spool.tiles("edges") for e in spool.read("edges", key)]
    return spool, stats, edges


@pytest.mark.parametrize("name", ["small.osm", "cross_tile.osm"])
def test_stream_edges_equal_in_memory_edges(name, tmp_path):
    path = FIX / name
    expected = sorted(build_graph(read_osm(path)).edges, key=_edge_key)
    spool, stats, edges = _stream(path, tmp_path)
    assert sorted(edges, key=_edge_key) == expected
    assert stats["edges"] == len(expected)
    for key in spool.tiles("edges"):
        for e in spool.read("edges", key):
            assert tile_of(*e.geometry[0]) == key  # spooled by from-tile


def test_spool_nodes_cover_all_endpoints(tmp_path):
    spool, _, edges = _stream(FIX / "cross_tile.osm", tmp_path)
    nodes = {n[0]: (k, n[1:]) for k in spool.tiles("nodes") for n in spool.read("nodes", k)}
    for e in edges:
        assert nodes[e.to_node][0] == tile_of(*e.geometry[-1])
    assert set(spool.tiles("nodes")) == {(34, 212), (35, 213)}


@pytest.mark.skipif(not BREMEN.exists(), reason="local Bremen extract missing")
def test_stream_edges_on_bremen(tmp_path):
    expected = build_graph(read_osm(BREMEN)).edges
    _, stats, edges = _stream(BREMEN, tmp_path)
    assert stats["edges"] == len(expected)
    assert sorted(edges, key=_edge_key) == sorted(expected, key=_edge_key)


@pytest.mark.parametrize("name", ["small.osm", "cross_tile.osm"])
def test_prefilter_keeps_edges_identical(name, tmp_path):
    src = FIX / name
    dst = tmp_path / "filtered.osm.pbf"
    stats = prefilter(src, dst)
    assert stats["ways"] >= 1
    _, _, before = _stream(src, tmp_path / "a")
    _, _, after = _stream(dst, tmp_path / "b")
    assert sorted(after, key=_edge_key) == sorted(before, key=_edge_key)


def test_prefilter_drops_unroutable(tmp_path):
    dst = tmp_path / "filtered.osm.pbf"
    prefilter(FIX / "small.osm", dst)
    ways = {w.id for w in read_osm(dst).ways}
    assert ways == {100, 101, 103}  # footway 104 and building 105 removed
    assert read_osm(dst).node_tags == {4: {"highway": "traffic_signals"}}


@pytest.mark.skipif(not BREMEN.exists(), reason="local Bremen extract missing")
def test_prefilter_on_bremen(tmp_path):
    dst = tmp_path / "bremen-filtered.osm.pbf"
    prefilter(BREMEN, dst)
    assert dst.stat().st_size < BREMEN.stat().st_size * 0.5
    _, stats, edges = _stream(dst, tmp_path / "s")
    assert stats["edges"] == len(build_graph(read_osm(BREMEN)).edges)


def _assembled(path, tmp_path):
    spool, _, _ = _stream(path, tmp_path)
    return {ti.key: ti.data for ti in assemble(spool)}


@pytest.mark.parametrize("name", ["small.osm", "cross_tile.osm"])
def test_assembled_tiles_are_byte_identical(name, tmp_path):
    path = FIX / name
    assert _assembled(path, tmp_path) == split_into_chunks(build_graph(read_osm(path)))


@pytest.mark.skipif(not BREMEN.exists(), reason="local Bremen extract missing")
def test_assembled_tiles_byte_identical_on_bremen(tmp_path):
    expected = split_into_chunks(build_graph(read_osm(BREMEN)))
    got = _assembled(BREMEN, tmp_path)
    assert set(got) == set(expected)
    for key, data in expected.items():
        assert got[key] == data, key


class _Ramp:
    def sample_many(self, lats, lons):
        return (np.asarray(lons) - 8.0) * 1000.0 + np.asarray(lats) * 10


def test_streaming_elevation_matches_in_memory(tmp_path):
    path = FIX / "small.osm"
    expected = split_into_chunks(apply_elevation(build_graph(read_osm(path)), _Ramp())[0])
    spool, _, _ = _stream(path, tmp_path)
    got = {ti.key: ti.data for ti in assemble(spool, heights=stream_heights(spool, _Ramp()))}
    assert got == expected


DEM_DIR = Path(__file__).resolve().parents[2] / "data" / "dem"


@pytest.mark.skipif(not (BREMEN.exists() and DEM_DIR.exists()), reason="local data missing")
def test_streaming_elevation_on_bremen(tmp_path):
    dem = Dem(DEM_DIR)
    expected = split_into_chunks(apply_elevation(build_graph(read_osm(BREMEN)), dem)[0])
    spool, _, _ = _stream(BREMEN, tmp_path)
    got = {ti.key: ti.data for ti in assemble(spool, heights=stream_heights(spool, dem))}
    assert got.keys() == expected.keys()
    for key in expected:
        assert got[key] == expected[key], key
