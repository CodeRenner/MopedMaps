"""Traffic volume (DTV) from state counting sections published as lines.

Unlike Baden-Württemberg (one point per counted section, traffic.py), these
states publish the counted sections themselves as line geometry, so an edge
takes the DTV of the section line it runs along:

- Bayern: BAYSIS SVZ 2021 Zählstellenbereiche (CC BY 4.0)
- Nordrhein-Westfalen: Straßen.NRW SVZ 2021 (dl-de/zero-2-0)
- Brandenburg: Landesbetrieb Straßenwesen, Verkehrsstärke 2021 (dl-de/by-2-0)
- Sachsen: LASuV SVZ 2021 (dl-de/by-2-0)
- Berlin: SenMVKU DTVw 2023, weekday traffic (dl-de/zero-2-0)
- Hamburg: BVM Verkehrsmengen HVS 2019 (dl-de/by-2-0)

Other states publish no machine-readable counts under an open licence, or
under terms that are unclear (Niedersachsen: "nicht zur Navigation
geeignet"), see docs/research-data-germany.md; they are left out on purpose.

`python -m mopedmaps_pipeline.traffic_lines OUT.jsonl.gz` downloads all sources
and writes one normalised file: one JSON object per line
{"ref": "B 3" | null, "dtv": 12000, "line": [[lat, lon], ...]}, simplified to
`config.TRAFFIC_LINE_SIMPLIFY_M`. A failing source is skipped, not fatal.
"""

from __future__ import annotations

import gzip
import http.client
import io
import json
import math
import re
import struct
import sys
import time
import urllib.request
import zipfile
from collections import defaultdict
from collections.abc import Callable, Iterable, Iterator, Sequence
from pathlib import Path
from typing import Any

from mopedmaps_pipeline import config
from mopedmaps_pipeline.geo import utm_to_latlon

Json = dict[str, Any]
LatLon = tuple[float, float]
Section = tuple[str | None, int, list[LatLon]]  # ref, dtv, line

BAYERN_URL = (
    "https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Verkehrsdaten/MapServer/WFSServer"
    "?service=WFS&version=2.0.0&request=GetFeature&typeNames=svz2021_zaehlstellenbereiche"
    "&outputFormat=GEOJSON&srsName=EPSG:4326"
)
NRW_URL = (
    "https://opendata.strassen.nrw.de/Verkehrsdaten/Strassenverkehrszaehlung/2021%20SVZ/"
    "2021%20Shape-File%20Netz/VERKEHRSWERTE2021_polyline"
)
BRANDENBURG_URL = (
    "https://ogc-api.geobasis-bb.de/datasets/zaehlstellen/collections/verkehrsstaerke_2021/items"
    "?f=json&limit=10000"
)
SACHSEN_URL = "https://www.list.smwa.sachsen.de/gdi/download/DE-SN-SBV-SVZ2021.zip"
BERLIN_URL = (
    "https://gdi.berlin.de/services/wfs/verkehrsmengen_2023?service=WFS&version=2.0.0"
    "&request=GetFeature&typeNames=verkehrsmengen_2023:dtvw2023kfz"
    "&outputFormat=application/json&srsName=EPSG:4326"
)
HAMBURG_URL = (
    "https://geodienste.hamburg.de/HH_WFS_Verkehrsmengen?service=WFS&version=2.0.0"
    "&request=GetFeature&typeNames=de.hh.up:verkehrsmengen_dtv_hvs_2019"
    "&outputFormat=application/geo%2Bjson&srsName=EPSG:4326"
)

# --- references ------------------------------------------------------------------

_REF_RE = re.compile(r"^\s*(A|B|L|K|S|St)\s*(\d+[a-z]?)\s*(\(.*\))?\s*$", re.IGNORECASE)
_KREIS_RE = re.compile(r"^\s*K\s+([A-ZÄÖÜ]{1,3})\s*(\d+[a-z]?)\s*$")


def section_ref(s: str | None) -> str | None:
    """'B 285', 'St 2286', 'K34(HX)', 'S93' -> OSM-style 'B 285', 'St 2286', 'K 34', 'S 93';
    Bavarian 'K NES 31' -> 'NES 31' (OSM ref of Bavarian Kreisstraßen). None otherwise."""
    if not s:
        return None
    m = _KREIS_RE.match(s)
    if m:
        return f"{m.group(1)} {m.group(2).lower()}"
    m = _REF_RE.match(s)
    if not m:
        return None
    prefix = m.group(1)
    prefix = "St" if prefix.lower() == "st" else prefix.upper()
    return f"{prefix} {m.group(2).lower()}"


def osm_refs(ref_tag: str | None) -> set[str]:
    """OSM `ref` (may list several: 'B 3;B 31') in the same normal form."""
    if not ref_tag:
        return set()
    return {r for r in (section_ref(p) for p in ref_tag.split(";")) if r}


# --- geometry --------------------------------------------------------------------

_M_PER_DEG_LAT = 110_574.0


def _xy(p: LatLon, cos_lat: float) -> tuple[float, float]:
    return p[1] * 111_320.0 * cos_lat, p[0] * _M_PER_DEG_LAT


def simplify(line: Sequence[LatLon], tol_m: float) -> list[LatLon]:
    """Douglas-Peucker in a local metric projection (iterative)."""
    if len(line) < 3:
        return list(line)
    cos_lat = math.cos(math.radians(line[0][0]))
    pts = [_xy(p, cos_lat) for p in line]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        best, idx = tol_m, -1
        for i in range(a + 1, b):
            d = _seg_dist(pts[i], pts[a], pts[b])
            if d > best:
                best, idx = d, i
        if idx >= 0:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(line, keep, strict=True) if k]


def _seg_dist(p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    ll = dx * dx + dy * dy
    t = 0.0 if ll == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / ll))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def _axis_deg(dx: float, dy: float) -> float:
    """Undirected direction of a vector in [0, 180)."""
    return math.degrees(math.atan2(dy, dx)) % 180.0


# --- index -----------------------------------------------------------------------


class LineIndex:
    """Grid of section segments; an edge takes the DTV of a parallel segment
    within `TRAFFIC_LINE_MAX_DISTANCE_M` of its midpoint whose road reference
    does not contradict the edge's."""

    def __init__(self, sections: Iterable[Section], cell_deg: float = 0.01) -> None:
        self.cell = cell_deg
        self.grid: dict[tuple[int, int], list[tuple[LatLon, LatLon, int, str | None]]] = (
            defaultdict(list)
        )
        self.sections = 0
        for ref, dtv, line in sections:
            if dtv <= 0 or len(line) < 2:
                continue
            self.sections += 1
            for a, b in zip(line, line[1:], strict=False):
                cells = {
                    self._cell(a),
                    self._cell(b),
                    self._cell(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)),
                }
                for c in cells:
                    self.grid[c].append((a, b, dtv, ref))

    def __len__(self) -> int:
        return self.sections

    def _cell(self, p: LatLon) -> tuple[int, int]:
        return int(math.floor(p[0] / self.cell)), int(math.floor(p[1] / self.cell))

    def dtv(self, ref_tag: str | None, geom: Sequence[LatLon]) -> int:
        if len(geom) < 2:
            return 0
        i = max(1, len(geom) // 2)
        a, b = geom[i - 1], geom[i]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        cy, cx = self._cell(mid)
        cos_lat = math.cos(math.radians(mid[0]))
        pa, pb, pm = _xy(a, cos_lat), _xy(b, cos_lat), _xy(mid, cos_lat)
        edge_axis = _axis_deg(pb[0] - pa[0], pb[1] - pa[1])
        refs = osm_refs(ref_tag)
        best_d, best = config.TRAFFIC_LINE_MAX_DISTANCE_M, 0
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for sa, sb, dtv, ref in self.grid.get((cy + dy, cx + dx), ()):
                    if refs and ref and ref not in refs:
                        continue
                    qa, qb = _xy(sa, cos_lat), _xy(sb, cos_lat)
                    d = _seg_dist(pm, qa, qb)
                    if d > best_d:
                        continue
                    diff = abs(_axis_deg(qb[0] - qa[0], qb[1] - qa[1]) - edge_axis)
                    if min(diff, 180.0 - diff) > config.TRAFFIC_LINE_MAX_ANGLE_DEG:
                        continue
                    best_d, best = d, dtv
        return best


def load_sections(path: Path) -> list[Section]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        out = []
        for row in f:
            o = json.loads(row)
            out.append((o["ref"], int(o["dtv"]), [(p[0], p[1]) for p in o["line"]]))
        return out


# --- shapefile (polyline) + dbf, enough for the NRW/Sachsen downloads ----------------


def read_shp_lines(shp: bytes) -> Iterator[list[list[tuple[float, float]]]]:
    """Yield the parts (lists of x, y) of each polyline record; [] for null shapes."""
    pos = 100
    while pos + 8 <= len(shp):
        _, words = struct.unpack(">ii", shp[pos : pos + 8])
        rec = shp[pos + 8 : pos + 8 + words * 2]
        pos += 8 + words * 2
        (shape_type,) = struct.unpack("<i", rec[:4])
        if shape_type not in (3, 13, 23):
            yield []
            continue
        n_parts, n_points = struct.unpack("<ii", rec[36:44])
        parts = list(struct.unpack(f"<{n_parts}i", rec[44 : 44 + 4 * n_parts])) + [n_points]
        base = 44 + 4 * n_parts
        xy = struct.unpack(f"<{2 * n_points}d", rec[base : base + 16 * n_points])
        pts = list(zip(xy[0::2], xy[1::2], strict=True))
        yield [pts[parts[k] : parts[k + 1]] for k in range(n_parts)]


def read_dbf(dbf: bytes, encoding: str = "latin-1") -> Iterator[dict[str, str]]:
    n_rec, header_len, rec_len = struct.unpack("<IHH", dbf[4:12])
    fields: list[tuple[str, int]] = []
    pos = 32
    while dbf[pos] != 0x0D:
        name = dbf[pos : pos + 11].split(b"\0", 1)[0].decode("ascii")
        fields.append((name, dbf[pos + 16]))
        pos += 32
    for r in range(n_rec):
        off = header_len + r * rec_len + 1  # skip the deletion flag
        row = {}
        for name, length in fields:
            row[name] = dbf[off : off + length].decode(encoding, "replace").strip()
            off += length
        yield row


def _int(v: Any) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def from_shapefile(
    shp: bytes, dbf: bytes, zone: int, ref_field: str, dtv_field: str
) -> list[Section]:
    out: list[Section] = []
    for parts, row in zip(read_shp_lines(shp), read_dbf(dbf), strict=True):
        ref, dtv = section_ref(row.get(ref_field)), _int(row.get(dtv_field))
        for part in parts:
            out.append((ref, dtv, [utm_to_latlon(x, y, zone) for x, y in part]))
    return out


def from_geojson(doc: Json, ref_field: str | None, dtv_field: str) -> list[Section]:
    out: list[Section] = []
    for f in doc.get("features", []):
        p, g = f.get("properties") or {}, f.get("geometry") or {}
        lines = (
            [g["coordinates"]] if g.get("type") == "LineString"
            else g.get("coordinates", []) if g.get("type") == "MultiLineString"
            else []
        )  # fmt: skip
        ref = section_ref(p.get(ref_field)) if ref_field else None
        dtv = _int(p.get(dtv_field))
        for line in lines:
            out.append((ref, dtv, [(c[1], c[0]) for c in line]))
    return out


# --- download --------------------------------------------------------------------

_UA = {"User-Agent": "MopedMaps traffic (github.com/CodeRenner/MopedMaps)"}


def _bytes(url: str, attempts: int = 4, backoff_s: float = 30.0) -> bytes:
    """GET with retries: some state servers drop large downloads midway or
    answer 403 to quick consecutive requests, so wait longer each time."""
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers=_UA)
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read()
        except (OSError, http.client.HTTPException) as err:
            if attempt == attempts:
                raise
            print(f"traffic: retry {attempt} for {url}: {err}", file=sys.stderr)
            time.sleep(backoff_s * attempt)
    raise AssertionError("unreachable")


def _nrw() -> list[Section]:
    shp = _bytes(NRW_URL + ".shp")
    time.sleep(10)  # the server refused the second file when asked right away
    return from_shapefile(shp, _bytes(NRW_URL + ".dbf"), 32, "STRBEZ", "DTVKFZA")


def _json(url: str) -> Json:
    return json.loads(_bytes(url))


def _sachsen() -> list[Section]:
    with zipfile.ZipFile(io.BytesIO(_bytes(SACHSEN_URL))) as z:
        shp = next(n for n in z.namelist() if n.lower().endswith(".shp"))
        return from_shapefile(z.read(shp), z.read(shp[:-4] + ".dbf"), 33, "strasse", "dtv_kfzges")


SOURCES: list[tuple[str, Callable[[], list[Section]]]] = [
    ("Bayern", lambda: from_geojson(_json(BAYERN_URL), "Straße", "DTV_Kfz")),
    ("Nordrhein-Westfalen", _nrw),
    ("Brandenburg", lambda: from_geojson(_json(BRANDENBURG_URL), "strasse", "KFZ")),
    ("Sachsen", _sachsen),
    ("Berlin", lambda: from_geojson(_json(BERLIN_URL), "str_bez", "dtvw_kfz")),
    ("Hamburg", lambda: from_geojson(_json(HAMBURG_URL), None, "dtv")),
]


def write_sections(path: Path, sections: Iterable[Section]) -> int:
    n = 0
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as f:
        for ref, dtv, line in sections:
            if dtv <= 0 or len(line) < 2:
                continue
            pts = simplify(line, config.TRAFFIC_LINE_SIMPLIFY_M)
            f.write(
                json.dumps(
                    {"ref": ref, "dtv": dtv, "line": [[round(a, 5), round(b, 5)] for a, b in pts]}
                )
            )
            f.write("\n")
            n += 1
    return n


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    out = Path(args[0] if args else "traffic-lines.jsonl.gz")
    sections: list[Section] = []
    for name, fetch in SOURCES:
        try:
            items = fetch()
        except Exception as err:  # one failing source must not drop the others
            print(f"traffic: {name} failed: {err}", file=sys.stderr)
            continue
        print(f"traffic: {name}: {len(items)} sections", file=sys.stderr)
        sections += items
    n = write_sections(out, sections)
    print(f"traffic: {n} sections -> {out} ({out.stat().st_size} bytes)", file=sys.stderr)
    return 0 if n else 1


if __name__ == "__main__":
    raise SystemExit(main())
