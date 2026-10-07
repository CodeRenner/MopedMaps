import json
from pathlib import Path

from mopedmaps_pipeline.cli import main
from mopedmaps_pipeline.osm_pbf import read_osm
from mopedmaps_pipeline.osm_xml import read_osm_xml

FIXTURE = Path(__file__).parent / "fixtures" / "small.osm"


def test_pyosmium_reader_matches_xml_reader():
    a, b = read_osm(FIXTURE), read_osm_xml(FIXTURE)
    routable = {w.id for w in b.ways if "highway" in w.tags}
    assert {w.id for w in a.ways} == routable
    assert a.node_tags == {4: {"highway": "traffic_signals"}}
    for nid, (lat, lon) in a.nodes.items():
        assert abs(lat - b.nodes[nid][0]) < 1e-7 and abs(lon - b.nodes[nid][1]) < 1e-7


def test_build_writes_tiles_and_manifest(tmp_path, capsys):
    assert main(["build", str(FIXTURE), str(tmp_path), "--verify"]) == 0
    m = json.loads((tmp_path / "manifest.json").read_text())
    assert m["totals"]["tiles"] == 1 and m["totals"]["edges"] == 4
    assert (tmp_path / "212_35.mmg").stat().st_size == m["tiles"]["212_35.mmg"]["bytes"]
    assert "OpenStreetMap" in m["attribution"]
    assert json.loads(capsys.readouterr().out)["edges"] == 4
