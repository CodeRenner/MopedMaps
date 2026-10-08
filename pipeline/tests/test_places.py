import json
from pathlib import Path

from mopedmaps_pipeline.places import build_places, place_kind, tile_doc

OSM = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="48.1000" lon="7.8500" version="1"/>
  <node id="2" lat="48.1002" lon="7.8504" version="1"/>
  <node id="3" lat="48.1004" lon="7.8508" version="1"/>
  <node id="4" lat="48.1000" lon="7.8510" version="1"/>
  <node id="5" lat="48.1001" lon="7.8511" version="1"/>
  <node id="6" lat="48.1001" lon="7.8510" version="1"/>
  <node id="10" lat="48.1010" lon="7.8520" version="1">
    <tag k="addr:street" v="Hauptstraße"/><tag k="addr:housenumber" v="5"/>
    <tag k="addr:postcode" v="79312"/><tag k="addr:city" v="Emmendingen"/>
  </node>
  <node id="11" lat="48.1012" lon="7.8522" version="1">
    <tag k="name" v="Kreiskrankenhaus"/><tag k="amenity" v="hospital"/>
  </node>
  <node id="12" lat="48.1100" lon="7.8600" version="1">
    <tag k="name" v="Emmendingen"/><tag k="place" v="town"/>
  </node>
  <node id="13" lat="48.1013" lon="7.8523" version="1"><tag k="name" v="Bank ohne Art"/></node>
  <way id="100" version="1">
    <nd ref="1"/><nd ref="2"/><nd ref="3"/>
    <tag k="highway" v="residential"/><tag k="name" v="Gartenweg"/>
  </way>
  <way id="101" version="1">
    <nd ref="4"/><nd ref="5"/><nd ref="6"/><nd ref="4"/>
    <tag k="building" v="yes"/><tag k="addr:street" v="Hauptstraße"/>
    <tag k="addr:housenumber" v="3"/><tag k="addr:postcode" v="79312"/>
    <tag k="addr:city" v="Emmendingen"/>
  </way>
</osm>
"""


def test_place_kind():
    assert place_kind({"name": "X", "amenity": "hospital"}) == "amenity=hospital"
    assert place_kind({"name": "X", "place": "town"}) == "place=town"
    assert place_kind({"name": "X", "place": "county"}) is None
    assert place_kind({"name": "X", "railway": "station"}) == "railway=station"
    assert place_kind({"amenity": "hospital"}) is None  # unnamed
    assert place_kind({"name": "X"}) is None


def test_build_places_from_osm(tmp_path: Path):
    src = tmp_path / "t.osm"
    src.write_text(OSM, encoding="utf-8")
    index = build_places(src, tmp_path / "out", 0.25)
    assert index["totals"] == {
        "addresses": 2,
        "streets": 1,
        "places": 2,
        "seconds": index["totals"]["seconds"],
    }
    assert list(index["tiles"]) == ["192_31.json"]
    doc = json.loads((tmp_path / "out" / "places" / "192_31.json").read_text())
    hs = next(s for s in doc["s"] if s[0] == "Hauptstraße")
    assert hs[1:3] == ["79312", "Emmendingen"]
    assert hs[5] == ["3", "5"]  # sorted by number; the building's centroid is used for 3
    assert hs[3:5] == [4810007, 785103]
    assert hs[6:] == [[93], [97]]  # 5 = 3 + delta
    garten = next(s for s in doc["s"] if s[0] == "Gartenweg")
    assert garten[3:] == [4810020, 785040, [], [], []]  # middle node of the street
    assert sorted(p[1] for p in doc["p"]) == ["amenity=hospital", "place=town"]
    assert not (tmp_path / "out" / "places-spool").exists()


def test_tile_doc_deduplicates():
    rows = [
        ["a", "Weg", "1", "X", "10", 100, 100],
        ["a", "Weg", "1", "X", "10", 101, 101],  # node + building of the same address
        ["p", "Aral", "amenity=fuel", 5000, 5000],
        ["p", "Aral", "amenity=fuel", 5010, 5010],  # node + area
        ["s", "Weg", 100, 100],
    ]
    doc = tile_doc(rows)
    assert doc["s"] == [["Weg", "1", "X", 100, 100, ["10"], [], []]]
    assert len(doc["p"]) == 1
