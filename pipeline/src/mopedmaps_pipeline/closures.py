"""Daily road-closure file for the app (`closures.json`), stdlib only.

Sources (Datenlizenz Deutschland – Namensnennung 2.0, see DATA_SOURCES.md):
- MobiData BW roadworks (Bundes-/Landes-/Kreisstraßen in Baden-Württemberg):
  line geometry, `type` ROAD_CLOSED vs CONSTRUCTION, direction, time window.
  ROAD_CLOSED -> kind "closed" (the router blocks matching edges).
- Stadt Freiburg "Verkehrsrelevante Baustellen" (WFS): construction-site
  polygons; whether a road is closed is only in free text, and the polygon
  can also cover open cross streets, so "Vollsperrung" entries become kind
  "avoid" (a time penalty, not a block).

Run: PYTHONPATH=pipeline/src python -m mopedmaps_pipeline.closures OUT.json
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

MOBIDATA_URL = "https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_geojson.json"
FREIBURG_URL = (
    "https://geoportal.freiburg.de/wfs/gut_baustellen/gut_baustellen?service=wfs&version=2.0.0"
    "&SRSNAME=EPSG:4326&request=getfeature&typename=baustellenumgriffe&outputformat=GEOJSON"
)
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


def _get(url: str) -> Json:
    req = urllib.request.Request(
        url, headers={"User-Agent": "MopedMaps closures (github.com/CodeRenner/MopedMaps)"}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def build(now: datetime | None = None) -> Json:
    now = now or datetime.now(UTC)
    closures: list[Json] = []
    sources = []
    for name, url, parse in (
        ("MobiData BW", MOBIDATA_URL, from_mobidata),
        ("Stadt Freiburg", FREIBURG_URL, from_freiburg),
    ):
        try:
            items = parse(_get(url), now)
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
