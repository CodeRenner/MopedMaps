"""Build the bundled PLZ -> centroid table from GeoNames postal codes.

Source: https://download.geonames.org/export/zip/DE.zip (CC BY 4.0,
attribution "GeoNames" required in the UI). Several rows can share one PLZ
(districts, large-customer PLZs); we average the distinct coordinates and keep
the most frequent place name.
"""

import io
import json
import zipfile
from collections import Counter, defaultdict
from collections.abc import Iterable
from pathlib import Path

ATTRIBUTION = "Postal codes: GeoNames (geonames.org), CC BY 4.0"
TABLE_VERSION = 1
COORD_DECIMALS = 4  # ~10 m; plenty for picking a 25-100 km area


def aggregate(lines: Iterable[str]) -> list[tuple[str, float, float, str]]:
    """Parse GeoNames rows -> sorted [(plz, lat, lon, name)]."""
    coords: dict[str, set[tuple[float, float]]] = defaultdict(set)
    names: dict[str, Counter[str]] = defaultdict(Counter)
    for line in lines:
        cols = line.rstrip("\n").split("\t")
        if len(cols) < 11 or cols[0] != "DE":
            continue
        plz, name = cols[1], cols[2]
        try:
            lat, lon = float(cols[9]), float(cols[10])
        except ValueError:
            continue
        if not (len(plz) == 5 and plz.isdigit()):
            continue
        coords[plz].add((lat, lon))
        names[plz][name] += 1

    rows = []
    for plz in sorted(coords):
        pts = coords[plz]
        lat = sum(p[0] for p in pts) / len(pts)
        lon = sum(p[1] for p in pts) / len(pts)
        # most frequent name; ties broken alphabetically for determinism
        name = min(names[plz].items(), key=lambda kv: (-kv[1], kv[0]))[0]
        rows.append((plz, round(lat, COORD_DECIMALS), round(lon, COORD_DECIMALS), name))
    return rows


def read_geonames_zip(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as z, z.open("DE.txt") as f:
        return io.TextIOWrapper(f, encoding="utf-8").readlines()


def write_table(rows: list[tuple[str, float, float, str]], out: Path) -> None:
    table = {"v": TABLE_VERSION, "attribution": ATTRIBUTION, "rows": [list(r) for r in rows]}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(table, ensure_ascii=False, separators=(",", ":")), "utf-8")
