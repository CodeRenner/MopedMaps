"""Daily road-closure file for the app (`closures.json`), stdlib only.

Sources (Datenlizenz Deutschland – Namensnennung 2.0, see DATA_SOURCES.md):
- MobiData BW roadworks (Bundes-/Landes-/Kreisstraßen in Baden-Württemberg):
  line geometry, `type` ROAD_CLOSED vs CONSTRUCTION, direction, time window.
  ROAD_CLOSED -> kind "closed" (the router blocks matching edges).
- Stadt Freiburg "Verkehrsrelevante Baustellen" (WFS): construction-site
  polygons; whether a road is closed is only in free text, and the polygon
  can also cover open cross streets, so "Vollsperrung" entries become kind
  "avoid" (a time penalty, not a block).
- Sachsen SPERRINFOSYS (LISt/LASuV, all road classes incl. municipal roads):
  daily GeoJSON in a ZIP, ETRS89/UTM33; "Vollsperrung" -> "closed".
- Landesbetrieb Straßenwesen Brandenburg Baustelleninfo (OGC API Features,
  B/L/K roads): `Art` "Sperrung" whose note says "Vollsperrung" -> "closed".
- VIZ Berlin roadworks: `severity` "Vollsperrung" -> "closed".

Other states publish roadworks only under unclear licences or behind a
Mobilithek subscription (docs/research-data-germany.md), so they are left out
on purpose.

Run: PYTHONPATH=pipeline/src python -m mopedmaps_pipeline.closures OUT.json
"""

from __future__ import annotations

import io
import json
import re
import sys
import urllib.request
import zipfile
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from mopedmaps_pipeline.geo import utm_to_latlon

MOBIDATA_URL = "https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_geojson.json"
FREIBURG_URL = (
    "https://geoportal.freiburg.de/wfs/gut_baustellen/gut_baustellen?service=wfs&version=2.0.0"
    "&SRSNAME=EPSG:4326&request=getfeature&typename=baustellenumgriffe&outputformat=GEOJSON"
)
SACHSEN_URL = "https://www.list.smwa.sachsen.de/gdi/download/baustelleninfo/Baustelleninfo_Sachsen_geojson.zip"
BRANDENBURG_URL = (
    "https://ogc-api.geobasis-bb.de/datasets/baustelleninfo/collections/baustelleninfo/items"
    "?f=json&limit=1000"
)
BERLIN_URL = "https://api.viz.berlin.de/daten/baustellen_sperrungen_viz.json"
# Keep closures that are active now or start within this many days (the app
# filters by its own clock again, the file may be a few days old offline).
LOOKAHEAD_DAYS = 7
_FULL_CLOSURE = re.compile(r"vollsperrung", re.IGNORECASE)

Json = dict[str, Any]


def _ll(coords: list[list[float]]) -> list[list[float]]:
    """GeoJSON [lon, lat] -> [lat, lon], 5 decimals (~1 m)."""
    return [[round(c[1], 5), round(c[0], 5)] for c in coords]


def _iso(s: str | None) -> str | None:
    if not s:
        return None
    s = s.strip()
    try:
        return datetime.fromisoformat(s).isoformat()
    except ValueError:
        return None


def _relevant(start: str | None, end: str | None, now: datetime) -> bool:
    def parse(v: str | None) -> datetime | None:
        if v is None:
            return None
        d = datetime.fromisoformat(v)
        return d if d.tzinfo else d.replace(tzinfo=UTC)

    s, e = parse(start), parse(end)
    if e is not None and e < now:
        return False
    return s is None or s <= now + timedelta(days=LOOKAHEAD_DAYS)


def from_mobidata(doc: Json, now: datetime) -> list[Json]:
    out = []
    for f in doc.get("features", []):
        p, g = f.get("properties", {}), f.get("geometry") or {}
        if p.get("type") != "ROAD_CLOSED" or g.get("type") != "LineString":
            continue
        start, end = _iso(p.get("starttime")), _iso(p.get("endtime"))
        if not _relevant(start, end, now):
            continue
        out.append({
            "id": f"bw:{p.get('id')}",
            "kind": "closed",
            "oneway": p.get("direction") == "ONE_DIRECTION",
            "label": p.get("street") or p.get("description") or "",
            "note": p.get("description") or "",
            "start": start,
            "end": end,
            "line": _ll(g["coordinates"]),
        })  # fmt: skip
    return out


def _day(s: str | None, end_of_day: bool) -> str | None:
    if not s:
        return None
    try:
        d = date.fromisoformat(s.strip()[:10])
    except ValueError:
        return None
    t = datetime(d.year, d.month, d.day, 23, 59) if end_of_day else datetime(d.year, d.month, d.day)
    return t.replace(tzinfo=UTC).isoformat()


def from_freiburg(doc: Json, now: datetime) -> list[Json]:
    out = []
    for i, f in enumerate(doc.get("features", [])):
        p, g = f.get("properties", {}), f.get("geometry") or {}
        note = p.get("verkehrshinweis") or ""
        if not _FULL_CLOSURE.search(note):
            continue
        start, end = _day(p.get("zeitraum_von"), False), _day(p.get("zeitraum_bis"), True)
        if not _relevant(start, end, now):
            continue
        rings = (
            [g["coordinates"][0]] if g.get("type") == "Polygon"
            else [poly[0] for poly in g.get("coordinates", [])] if g.get("type") == "MultiPolygon"
            else []
        )  # fmt: skip
        for j, ring in enumerate(rings):
            out.append({
                "id": f"fr:{p.get('id', i)}:{j}",
                "kind": "avoid",
                "oneway": False,
                "label": (p.get("name") or "").strip(),
                "note": note,
                "start": start,
                "end": end,
                "polygon": _ll(ring),
            })  # fmt: skip
    return out


def _de_day(s: str | None, end_of_day: bool) -> str | None:
    """'14.10.2026' -> ISO (UTC day bounds)."""
    m = re.fullmatch(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", (s or "").strip())
    return _day(f"{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}", end_of_day) if m else None


def from_sachsen(doc: Json, now: datetime) -> list[Json]:
    out = []
    for f in doc.get("features", []):
        p, g = f.get("properties", {}), f.get("geometry") or {}
        if p.get("Sperrung_Art_Klartext") != "Vollsperrung" or g.get("type") != "LineString":
            continue
        start = _de_day(p.get("Sperrung_von"), False)
        end = _de_day(p.get("Sperrung_bis"), True)
        if not _relevant(start, end, now):
            continue
        line = [[round(c, 5) for c in utm_to_latlon(x, y)] for x, y, *_ in g["coordinates"]]
        out.append({
            "id": f"sn:{p.get('ID')}",
            "kind": "closed",
            "oneway": False,
            "label": " ".join(x for x in (p.get("Strasse"), p.get("Ort")) if x),
            "note": " – ".join(x for x in (p.get("Sperrung_Grund"), p.get("Ortslage")) if x),
            "start": start,
            "end": end,
            "line": line,
        })  # fmt: skip
    return out


def from_brandenburg(doc: Json, now: datetime) -> list[Json]:
    out = []
    for f in doc.get("features", []):
        p, g = f.get("properties", {}), f.get("geometry") or {}
        note = (p.get("Verkehrsinformation") or "").strip()
        if p.get("Art") != "Sperrung" or g.get("type") != "LineString":
            continue
        if not _FULL_CLOSURE.search(note):
            continue
        start = _day(p.get("Baustellen_Beginn"), False)
        end = _day(p.get("Baustellen_Ende"), True)
        if not _relevant(start, end, now):
            continue
        out.append({
            "id": f"bb:{p.get('ID')}",
            "kind": "closed",
            "oneway": False,
            "label": " ".join(x for x in (p.get("Straßenummner"), p.get("Ortsangabe")) if x),
            "note": re.sub(r"\s+", " ", note)[:300],
            "start": start,
            "end": end,
            "line": _ll(g["coordinates"]),
        })  # fmt: skip
    return out


def _local_iso(s: str | None) -> str | None:
    """VIZ times are local (Europe/Berlin) without offset; +02:00 is close enough."""
    v = _iso(s)
    return None if v is None else v if "+" in v[10:] else v + "+02:00"


def from_berlin(doc: Json, now: datetime) -> list[Json]:
    out = []
    for i, f in enumerate(doc.get("features", [])):
        p, g = f.get("properties", {}), f.get("geometry") or {}
        if p.get("severity") != "Vollsperrung":
            continue
        parts = g.get("geometries", [g]) if g.get("type") == "GeometryCollection" else [g]
        lines = [x["coordinates"] for x in parts if x.get("type") == "LineString"]
        lines += [c for x in parts if x.get("type") == "MultiLineString" for c in x["coordinates"]]
        v = p.get("validity") or {}
        start, end = _local_iso(v.get("from")), _local_iso(v.get("to"))
        if not lines or not _relevant(start, end, now):
            continue
        for j, line in enumerate(lines):
            out.append({
                "id": f"be:{p.get('id', i)}:{j}",
                "kind": "closed",
                "oneway": False,
                "label": p.get("street") or "",
                "note": " – ".join(x for x in (p.get("section"), p.get("content")) if x),
                "start": start,
                "end": end,
                "line": _ll(line),
            })  # fmt: skip
    return out


_UA = {"User-Agent": "MopedMaps closures (github.com/CodeRenner/MopedMaps)"}


def _get(url: str) -> Json:
    req = urllib.request.Request(url, headers=_UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def _get_paged(url: str) -> Json:
    """OGC API Features: follow `next` links."""
    features: list[Json] = []
    next_url: str | None = url
    while next_url and len(features) < 50000:
        page = _get(next_url)
        features += page.get("features", [])
        next_url = next((x["href"] for x in page.get("links", []) if x.get("rel") == "next"), None)
    return {"features": features}


def _get_zip_geojson(url: str, member_contains: str) -> Json:
    req = urllib.request.Request(url, headers=_UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        name = next(n for n in z.namelist() if member_contains in n and n.endswith(".geojson"))
        return json.loads(z.read(name))


def build(now: datetime | None = None) -> Json:
    now = now or datetime.now(UTC)
    closures: list[Json] = []
    sources = []
    for name, fetch, parse in (
        ("MobiData BW", lambda: _get(MOBIDATA_URL), from_mobidata),
        ("Stadt Freiburg", lambda: _get(FREIBURG_URL), from_freiburg),
        ("Sachsen", lambda: _get_zip_geojson(SACHSEN_URL, "Sperrungen"), from_sachsen),
        ("Brandenburg", lambda: _get_paged(BRANDENBURG_URL), from_brandenburg),
        ("Berlin", lambda: _get(BERLIN_URL), from_berlin),
    ):
        try:
            items = parse(fetch(), now)
        except Exception as err:  # one failing source must not drop the other
            print(f"closures: {name} failed: {err}", file=sys.stderr)
            continue
        closures += items
        sources.append({"name": name, "count": len(items)})
    return {"version": 1, "generated": now.isoformat(), "sources": sources, "closures": closures}


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    out = Path(args[0] if args else "closures.json")
    doc = build()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
    print(
        f"closures: {len(doc['closures'])} -> {out} ({out.stat().st_size} bytes) {doc['sources']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
