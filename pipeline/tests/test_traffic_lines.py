import gzip
import json
import struct
from pathlib import Path

from mopedmaps_pipeline.traffic import TrafficIndex
from mopedmaps_pipeline.traffic_lines import (
    LineIndex,
    from_geojson,
    from_shapefile,
    load_sections,
    osm_refs,
    section_ref,
    simplify,
    write_sections,
)


def test_section_refs_match_osm_style():
    assert section_ref("B 285") == "B 285"
    assert section_ref("St 2286") == "St 2286"
    assert section_ref("K34(HX)") == "K 34"
    assert section_ref("S93") == "S 93"
    assert section_ref("K NES 31") == "NES 31"  # Bavarian Kreisstraße, OSM ref "NES 31"
    assert section_ref("Königstraße") is None
    assert section_ref(None) is None
    assert osm_refs("B 3;St 2286") == {"B 3", "St 2286"}


LINE = [(48.0, 11.0), (48.0, 11.01)]  # ~745 m west-east


def test_edge_takes_parallel_section_with_compatible_ref():
    idx = LineIndex([("B 3", 15000, LINE), (None, 4000, [(48.01, 11.0), (48.01, 11.01)])])
    along = [(48.0001, 11.004), (48.0001, 11.006)]  # 11 m north of the line, parallel
    assert idx.dtv("B 3", along) == 15000
    assert idx.dtv(None, along) == 15000  # unnamed edge: geometry decides
    assert idx.dtv("B 31", along) == 0  # another road
    across = [(47.999, 11.005), (48.001, 11.005)]  # crossing street
    assert idx.dtv(None, across) == 0
    far = [(48.0005, 11.004), (48.0005, 11.006)]  # 55 m away
    assert idx.dtv("B 3", far) == 0
    assert idx.dtv("L 1", [(48.01, 11.004), (48.01, 11.006)]) == 4000  # section without ref


def test_traffic_index_prefers_lines_then_stations():
    idx = TrafficIndex([("B 3", 48.0, 11.02, 9000)], LineIndex([("B 3", 15000, LINE)]))
    assert idx.edge_dtv("B 3", [(48.0, 11.004), (48.0, 11.006)]) == 15000
    assert idx.edge_dtv("B 3", [(48.0, 11.03), (48.0, 11.031)]) == 9000  # off the line
    assert TrafficIndex(lines=LineIndex([])).edge_dtv("B 3", LINE) == 0


def test_simplify_keeps_shape_drops_collinear_points():
    line = [(48.0, 11.0 + i * 0.0001) for i in range(50)] + [(48.001, 11.0049)]
    out = simplify(line, 3.0)
    assert out[0] == line[0] and out[-1] == line[-1] and len(out) == 3


def test_geojson_and_roundtrip(tmp_path: Path):
    doc = {"features": [
        {"geometry": {"type": "MultiLineString", "coordinates": [[[11.0, 48.0], [11.01, 48.0]]]},
         "properties": {"Straße": "K NES 31", "DTV_Kfz": 1298.0}},
        {"geometry": {"type": "LineString", "coordinates": [[11.0, 48.0], [11.01, 48.0]]},
         "properties": {"Straße": "B 3", "DTV_Kfz": None}},
    ]}  # fmt: skip
    secs = from_geojson(doc, "Straße", "DTV_Kfz")
    assert secs[0] == ("NES 31", 1298, [(48.0, 11.0), (48.0, 11.01)])
    p = tmp_path / "t.jsonl.gz"
    assert write_sections(p, secs) == 1  # zero DTV dropped
    assert load_sections(p) == [("NES 31", 1298, [(48.0, 11.0), (48.0, 11.01)])]
    with gzip.open(p, "rt") as f:
        assert json.loads(f.readline())["ref"] == "NES 31"


def _shp_polyline(parts: list[list[tuple[float, float]]]) -> bytes:
    pts = [p for part in parts for p in part]
    starts, n = [], 0
    for part in parts:
        starts.append(n)
        n += len(part)
    content = struct.pack("<i4d2i", 3, 0, 0, 0, 0, len(parts), len(pts))
    content += struct.pack(f"<{len(parts)}i", *starts)
    content += b"".join(struct.pack("<2d", *p) for p in pts)
    rec = struct.pack(">ii", 1, len(content) // 2) + content
    return b"\0" * 100 + rec


def _dbf(fields: list[tuple[str, int]], rows: list[list[str]]) -> bytes:
    rec_len = 1 + sum(n for _, n in fields)
    header_len = 32 + 32 * len(fields) + 1
    out = struct.pack("<BBBBIHH20x", 3, 26, 1, 1, len(rows), header_len, rec_len)
    for name, n in fields:
        out += name.encode().ljust(11, b"\0") + b"C" + b"\0" * 4 + bytes([n, 0]) + b"\0" * 14
    out += b"\r"
    for row in rows:
        out += b" " + b"".join(
            v.encode("latin-1").ljust(n) for v, (_, n) in zip(row, fields, strict=True)
        )
    return out


def test_shapefile_reader_reprojects_utm():
    shp = _shp_polyline([[(431627.739, 5686777.216), (431700.0, 5686800.0)]])
    dbf = _dbf([("strasse", 10), ("dtv_kfzges", 8)], [["S 93", "3200"]])
    ((ref, dtv, line),) = from_shapefile(shp, dbf, 33, "strasse", "dtv_kfzges")
    assert (ref, dtv) == ("S 93", 3200)
    assert round(line[0][0], 5) == 51.32817 and round(line[0][1], 5) == 14.01866
