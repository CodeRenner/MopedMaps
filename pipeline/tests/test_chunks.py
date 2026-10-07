from pathlib import Path

import pytest

from mopedmaps_pipeline.chunks import (
    EDGE,
    HEADER,
    _read_varint,
    _unzigzag,
    _write_varint,
    _zigzag,
    decode_chunk,
    split_into_chunks,
    tile_name,
    tile_of,
)
from mopedmaps_pipeline.graph import build_graph
from mopedmaps_pipeline.osm_xml import read_osm_xml
from mopedmaps_pipeline.tags import AccessFlag, RoadClass, Surface

FIXTURE = Path(__file__).parent / "fixtures" / "small.osm"


def test_struct_sizes_match_spec():
    assert HEADER.size == 32
    assert EDGE.size == 36


@pytest.mark.parametrize("n", [0, 1, -1, 63, -64, 300, -300, 2**31, -(2**31)])
def test_varint_zigzag_roundtrip(n):
    buf = bytearray()
    _write_varint(buf, _zigzag(n))
    v, pos = _read_varint(bytes(buf), 0)
    assert _unzigzag(v) == n and pos == len(buf)


def test_tile_of_and_name():
    assert tile_of(53.07, 8.81) == (35, 212)
    assert tile_of(-0.1, -0.1) == (-1, -1)
    assert tile_name((35, 212)) == "212_35.mmg"


def test_roundtrip_single_tile():
    g = build_graph(read_osm_xml(FIXTURE))
    chunks = split_into_chunks(g)
    assert list(chunks) == [(35, 212)]
    c = decode_chunk(chunks[(35, 212)])
    assert len(c.nodes) == len(g.nodes)
    assert len(c.edges) == len(g.edges)

    by_len = {round(e.length_m): e for e in g.edges}
    for d in c.edges:
        orig = by_len[round(d.length_m)]
        assert d.length_m == pytest.approx(orig.length_m, abs=0.05)
        assert d.road_class is orig.road_class
        assert d.flags == orig.flags
        assert d.maxspeed_fwd == orig.maxspeed_fwd
        assert d.surface is orig.surface
        assert d.lit == orig.lit
        assert d.cycleway == orig.cycleway
        assert d.signals == orig.signals
        assert len(d.shape) == len(orig.geometry) - 2
        for got, want in zip(d.shape, orig.geometry[1:-1], strict=True):
            assert got == pytest.approx(want, abs=1e-7)


def test_cross_tile_edge_points_to_neighbour(tmp_path):
    osm = tmp_path / "x.osm"
    osm.write_text(
        """<osm>
        <node id="1" lat="53.20" lon="8.70"/>
        <node id="2" lat="53.30" lon="8.71"/>
        <node id="3" lat="53.30" lon="8.80"/>
        <way id="1"><nd ref="1"/><nd ref="2"/><nd ref="3"/>
          <tag k="highway" v="secondary"/><tag k="surface" v="sett"/></way>
        </osm>"""
    )
    chunks = split_into_chunks(build_graph(read_osm_xml(osm)))
    assert set(chunks) == {(34, 212), (35, 213)}
    south = decode_chunk(chunks[(34, 212)])
    north = decode_chunk(chunks[(35, 213)])
    assert len(south.edges) == 1 and not north.edges
    e = south.edges[0]
    assert e.to_tile == (35, 213)
    assert north.nodes[e.to_idx] == pytest.approx((53.30, 8.80))
    assert e.road_class is RoadClass.SECONDARY and e.surface is Surface.COBBLE
    assert e.shape == [pytest.approx((53.30, 8.71))]
    assert AccessFlag.MOPED in e.flags


def test_decode_rejects_bad_magic():
    with pytest.raises(ValueError):
        decode_chunk(b"XXXX" + bytes(28))
