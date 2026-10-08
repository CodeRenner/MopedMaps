from pathlib import Path

from mopedmaps_pipeline.chunks import decode_chunk, split_into_chunks
from mopedmaps_pipeline.graph import build_graph
from mopedmaps_pipeline.osm_xml import OsmData, Way
from mopedmaps_pipeline.traffic import TrafficIndex, load_bw_csv, normalize_ref, way_refs

CSV = """svznr,zstart,klasse,nummer,gpsx1,gpsy1,RI,RII,DTV2024,DTVSV
1,TM,L,116,7.80,48.00,a,b,12087,400
2,TM,B,3,7.85,48.00,a,b,51320,2000
3,TM,K,4979,7.80,48.00,a,b,0,0
"""


def test_normalize_refs():
    assert normalize_ref("B3") == "B 3"
    assert normalize_ref(" l 116 ") == "L 116"
    assert normalize_ref("B 31a") == "B 31a"
    assert normalize_ref("A 5") == "A 5"
    assert normalize_ref("St 2345") is None
    assert way_refs("B 3;B 31") == ["B 3", "B 31"]
    assert way_refs(None) == []


def test_load_csv_and_lookup(tmp_path: Path):
    p = tmp_path / "svz.csv"
    p.write_text(CSV, encoding="utf-8")
    idx = load_bw_csv(p)
    assert len(idx) == 2  # zero DTV row dropped
    assert idx.dtv("L 116", 48.001, 7.801) == 12087
    assert idx.dtv("B 3;B 31", 48.0, 7.86) == 51320  # any listed ref matches
    assert idx.dtv("L 116", 48.2, 7.80) == 0  # ~22 km away: unknown, no guessing
    assert idx.dtv("L 117", 48.0, 7.80) == 0  # other road
    assert idx.dtv(None, 48.0, 7.80) == 0


def test_dtv_written_to_chunks():
    data = OsmData(
        nodes={1: (48.0, 7.80), 2: (48.0, 7.81), 3: (48.0, 7.82)},
        ways=[
            Way(10, (1, 2), {"highway": "secondary", "ref": "L 116"}),
            Way(11, (2, 3), {"highway": "residential"}),
        ],
        node_tags={},
    )
    idx = TrafficIndex([("L 116", 48.0, 7.80, 12087)])
    g = build_graph(data, idx)
    assert {e.way_id: e.dtv for e in g.edges} == {10: 12087, 11: 0}
    for buf in split_into_chunks(g, 0.25).values():
        edges = decode_chunk(buf).edges
        assert sorted(e.dtv for e in edges) == [0, 12090]  # stored in units of 10
