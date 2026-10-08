"""Traffic volume (DTV, vehicles per day) from official counting stations.

Source: "Karte der Straßenverkehrszählung in Baden-Württemberg",
Verkehrsministerium Baden-Württemberg via MobiData BW, Datenlizenz Deutschland
– Namensnennung 2.0 (see DATA_SOURCES.md, docs/research-traffic-data.md).
The CSV lists one point per counted section with road class + number
("L" + "116"), WGS84 coordinates and the DTV.

Matching: an edge gets the DTV of the nearest station on a road with the same
reference ("L 116") within `config.TRAFFIC_MAX_DISTANCE_M`. Stations stand for a
section between two junctions, so the nearest one on the same road is the
best available estimate; farther away (other section, other town) the value is
not used (0 = unknown, no guessing).
"""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from collections.abc import Iterable
from pathlib import Path

from mopedmaps_pipeline import config
from mopedmaps_pipeline.geo import haversine_m

_REF_RE = re.compile(r"^\s*([ABLK])\s*(\d+[a-z]?)\s*$", re.IGNORECASE)


def normalize_ref(ref: str) -> str | None:
    """'B3', 'b 3', ' L 116 ' -> 'B 3' / 'L 116'; None for other formats."""
    m = _REF_RE.match(ref)
    return f"{m.group(1).upper()} {m.group(2).lower()}" if m else None


def way_refs(ref_tag: str | None) -> list[str]:
    """OSM `ref` may list several roads ('B 3;B 31')."""
    if not ref_tag:
        return []
    return [r for r in (normalize_ref(p) for p in ref_tag.split(";")) if r]


class TrafficIndex:
    """Stations grouped by road reference."""

    def __init__(self, stations: Iterable[tuple[str, float, float, int]]) -> None:
        self.by_ref: dict[str, list[tuple[float, float, int]]] = defaultdict(list)
        for ref, lat, lon, dtv in stations:
            self.by_ref[ref].append((lat, lon, dtv))

    def __len__(self) -> int:
        return sum(len(v) for v in self.by_ref.values())

    def dtv(self, ref_tag: str | None, lat: float, lon: float) -> int:
        """DTV for a point on a road with OSM `ref` ref_tag; 0 if unknown."""
        best_d, best = config.TRAFFIC_MAX_DISTANCE_M, 0
        for ref in way_refs(ref_tag):
            for s_lat, s_lon, dtv in self.by_ref.get(ref, ()):
                d = haversine_m((lat, lon), (s_lat, s_lon))
                if d <= best_d:
                    best_d, best = d, dtv
        return best


def load_bw_csv(path: Path) -> TrafficIndex:
    """Read the BW counting-station CSV (columns klasse, nummer, gpsx1, gpsy1, DTV<year>)."""
    rows: list[tuple[str, float, float, int]] = []
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames or []
        dtv_col = next((c for c in fields if re.fullmatch(r"DTV\d{4}", c)), None)
        if dtv_col is None:
            raise ValueError(f"{path}: no DTV<year> column in {fields}")
        for row in reader:
            ref = normalize_ref(f"{row['klasse']} {row['nummer']}")
            try:
                lon, lat, dtv = float(row["gpsx1"]), float(row["gpsy1"]), int(float(row[dtv_col]))
            except (TypeError, ValueError):
                continue
            if ref and dtv > 0:
                rows.append((ref, lat, lon, dtv))
    return TrafficIndex(rows)
