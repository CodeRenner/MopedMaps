from datetime import UTC, datetime

import pytest

from mopedmaps_pipeline.closures import (
    from_berlin,
    from_brandenburg,
    from_freiburg,
    from_mobidata,
    from_sachsen,
    utm_to_latlon,
)

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


def test_utm33_inverse_matches_known_points():
    # Central meridian and a point near Bautzen (checked against PROJ, EPSG:25833 -> 4326).
    lat, lon = utm_to_latlon(500000, 5300000)
    assert lon == pytest.approx(15.0) and lat == pytest.approx(47.85334, abs=1e-5)
    lat, lon = utm_to_latlon(431627.739, 5686777.216)
    assert (lat, lon) == pytest.approx((51.32817, 14.01866), abs=1e-5)


def _sn(art: str, von: str, bis: str) -> dict:
    return {
        "geometry": {
            "type": "LineString", "coordinates": [[431627.7, 5686777.2], [431610.3, 5686779.9]],
        },
        "properties": {
            "ID": "X1", "Sperrung_Art_Klartext": art, "Strasse": "Hauptstraße", "Ort": "Bulleritz",
            "Sperrung_von": von, "Sperrung_bis": bis, "Sperrung_Grund": "Fahrbahnerneuerung",
        },
    }  # fmt: skip


def test_sachsen_full_closures_only_reprojected():
    doc = {
        "features": [
            _sn("Vollsperrung", "01.10.2026", "23.10.2026"),
            _sn("Halbseitige Sperrung", "01.10.2026", "23.10.2026"),
            _sn("Vollsperrung", "01.01.2026", "02.01.2026"),  # over
        ]
    }
    out = from_sachsen(doc, NOW)
    assert len(out) == 1
    c = out[0]
    assert c["kind"] == "closed" and not c["oneway"] and c["id"] == "sn:X1"
    assert c["line"][0] == pytest.approx([51.32817, 14.01866], abs=2e-5)
    assert c["start"].startswith("2026-10-01") and c["end"].startswith("2026-10-23T23:59")


def _bb(art: str, note: str) -> dict:
    return {
        "geometry": {"type": "LineString", "coordinates": [[14.29, 53.11], [14.30, 53.12]]},
        "properties": {
            "ID": "1_1", "Art": art, "Straßenummner": "L50", "Ortsangabe": "Bärenklau",
            "Verkehrsinformation": note,
            "Baustellen_Beginn": "2026-09-07", "Baustellen_Ende": "2026-11-13",
        },
    }  # fmt: skip


def test_brandenburg_needs_sperrung_and_full_closure_note():
    doc = {
        "features": [
            _bb("Sperrung", "Deckenerneuerung VOLLSPERRUNG auf der L50"),
            _bb("Sperrung", "halbseitige Sperrung mit Ampel"),
            _bb("Bauabschnitt", "Vollsperrung"),
        ]
    }
    out = from_brandenburg(doc, NOW)
    assert [c["id"] for c in out] == ["bb:1_1"]
    assert out[0]["line"][0] == [53.11, 14.29]


def test_berlin_full_closures_use_the_line_part():
    geom = {
        "type": "GeometryCollection",
        "geometries": [
            {"type": "Point", "coordinates": [13.38, 52.52]},
            {"type": "LineString", "coordinates": [[13.38, 52.52], [13.385, 52.521]]},
        ],
    }
    feats = [
        {"geometry": geom, "properties": {
            "id": "17/2025", "severity": sev, "street": "Schiffbauerdamm",
            "validity": {"from": "2025-07-09T07:00", "to": "2026-10-28T17:00"},
        }}
        for sev in ("Vollsperrung", "Fahrtrichtungssperrung", "keine Sperrung")
    ]  # fmt: skip
    out = from_berlin({"features": feats}, NOW)
    assert len(out) == 1
    assert out[0]["line"] == [[52.52, 13.38], [52.521, 13.385]]
    assert out[0]["end"] == "2026-10-28T17:00:00+02:00"
