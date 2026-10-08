from datetime import UTC, datetime

from mopedmaps_pipeline.closures import from_freiburg, from_mobidata

NOW = datetime(2026, 10, 8, 12, tzinfo=UTC)


def _bw(type_: str, start: str, end: str, direction: str = "BOTH_DIRECTIONS") -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": [[7.8512345, 48.0], [7.86, 48.01]]},
        "properties": {
            "id": "x", "type": type_, "street": "L 116", "description": "Sperrung",
            "direction": direction, "starttime": start, "endtime": end,
        },
    }  # fmt: skip


def test_mobidata_keeps_active_closures_only():
    doc = {
        "features": [
            _bw("ROAD_CLOSED", "2026-10-01T00:00:00+02:00", "2026-10-20T00:00:00+02:00"),
            _bw("CONSTRUCTION", "2026-10-01T00:00:00+02:00", "2026-10-20T00:00:00+02:00"),
            _bw("ROAD_CLOSED", "2026-01-01T00:00:00+01:00", "2026-02-01T00:00:00+01:00"),  # over
            _bw(
                "ROAD_CLOSED", "2027-01-01T00:00:00+01:00", "2027-02-01T00:00:00+01:00"
            ),  # far ahead
            _bw(
                "ROAD_CLOSED",
                "2026-10-10T00:00:00+02:00",
                "2026-10-11T00:00:00+02:00",
                "ONE_DIRECTION",
            ),
        ]
    }
    out = from_mobidata(doc, NOW)
    assert [c["oneway"] for c in out] == [False, True]
    assert out[0]["kind"] == "closed"
    assert out[0]["line"] == [[48.0, 7.85123], [48.01, 7.86]]  # lat, lon, 5 decimals


def test_freiburg_full_closures_become_avoid_polygons():
    ring = [[7.80, 48.0], [7.81, 48.0], [7.81, 48.01], [7.80, 48.0]]
    doc = {
        "features": [
            {
                "geometry": {"type": "Polygon", "coordinates": [ring]},
                "properties": {
                    "name": "Haslacher Straße", "zeitraum_von": "2026-09-28",
                    "zeitraum_bis": "2026-12-18",
                    "verkehrshinweis": "Vollsperrung der Haslacher Straße",
                },
            },
            {
                "geometry": {"type": "Polygon", "coordinates": [ring]},
                "properties": {
                    "name": "Elsässer Straße", "zeitraum_von": "2026-06-15",
                    "zeitraum_bis": "2026-12-18",
                    "verkehrshinweis": "Halbseitige Sperrung mit Ampelregelung",
                },
            },
        ]
    }  # fmt: skip
    out = from_freiburg(doc, NOW)
    assert len(out) == 1
    assert out[0]["kind"] == "avoid" and out[0]["label"] == "Haslacher Straße"
    assert out[0]["polygon"][0] == [48.0, 7.8]
    assert out[0]["end"].startswith("2026-12-18T23:59")
