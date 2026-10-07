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


def test_streaming_build_writes_identical_tiles(tmp_path):
    mem, stream = tmp_path / "mem", tmp_path / "stream"
    assert main(["build", str(FIXTURE), str(mem)]) == 0
    assert (
        main(["build", str(FIXTURE), str(stream), "--streaming", "--workdir", str(tmp_path)]) == 0
    )
    for f in mem.glob("*.mmg"):
        assert (stream / f.name).read_bytes() == f.read_bytes()
    a = json.loads((mem / "manifest.json").read_text())
    b = json.loads((stream / "manifest.json").read_text())
    assert a["tiles"] == b["tiles"]
    for k in ("prefilter_s", "junctions_s", "edges_s", "elevation_s"):
        assert k in b["totals"]
    assert not list(tmp_path.glob("mmg-build-*"))  # temp dir cleaned up
