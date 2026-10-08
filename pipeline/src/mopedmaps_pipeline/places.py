"""Addresses, streets and named places per tile for the offline search.

One pass over the OSM extract (node locations for building centroids):
- addresses: objects with `addr:housenumber` and `addr:street` (or
  `addr:place`), grouped per (street, postcode, city);
- streets: named highways, one point per name and tile (finds streets
  without house numbers, e.g. "Hauptstraße Emmendingen");
- places: named shops, amenities, tourism, offices, healthcare, settlements
  and stations (`PLACE_KEYS`).

Output: `<out>/places/<iy>_<ix>.json` (same tile grid as the graph) plus
`<out>/places/index.json`. Tile format (v1), coordinates in 1e-5 degrees:
{"v": 1,
 "s": [[street, postcode, city, lat, lon, [housenumbers], [dlat], [dlon]], ...],
 "p": [[name, kind, lat, lon], ...]}
The first house is at (lat, lon); each further one adds its (dlat, dlon) to
the previous. Streets without addresses have empty lists.
"""

from __future__ import annotations

import gzip
import json
import time
from collections import defaultdict
from pathlib import Path

import osmium

from mopedmaps_pipeline import config
from mopedmaps_pipeline.chunks import TileKey, tile_of

Kind = str
_E5 = 100_000

# Tag keys whose named objects become search places; the value is kept as
# the kind ("amenity=hospital"). `place` only for settlements and districts.
PLACE_KEYS = ("amenity", "shop", "tourism", "leisure", "office", "healthcare", "craft", "historic")
SETTLEMENTS = {
    "city",
    "town",
    "village",
    "hamlet",
    "suburb",
    "quarter",
    "neighbourhood",
    "isolated_dwelling",
}
STATION_TAGS = (("railway", "station"), ("railway", "halt"), ("public_transport", "station"))


def place_kind(tags: osmium.osm.TagList | dict[str, str]) -> Kind | None:
    if not tags.get("name"):
        return None
    if tags.get("place") in SETTLEMENTS:
        return f"place={tags['place']}"
    for k, v in STATION_TAGS:
        if tags.get(k) == v:
            return f"{k}={v}"
    for k in PLACE_KEYS:
        v = tags.get(k)
        if v and v != "no":
            return f"{k}={v}"
    return None


def _e5(x: float) -> int:
    return round(x * _E5)


class _Spool:
    """Per-tile JSON-lines spool with bounded open files (append in batches)."""

    def __init__(self, directory: Path, flush_every: int = 5000) -> None:
        self.dir = directory
        self.dir.mkdir(parents=True, exist_ok=True)
        self.flush_every = flush_every
        self.buf: dict[TileKey, list[str]] = defaultdict(list)

    def add(self, key: TileKey, row: list) -> None:
        b = self.buf[key]
        b.append(json.dumps(row, ensure_ascii=False, separators=(",", ":")))
        if len(b) >= self.flush_every:
            self._flush(key)

    def _path(self, key: TileKey) -> Path:
        return self.dir / f"{key[1]}_{key[0]}.jsonl"

    def _flush(self, key: TileKey) -> None:
        rows = self.buf.pop(key, [])
        if rows:
            with self._path(key).open("a", encoding="utf-8") as f:
                f.write("\n".join(rows) + "\n")

    def close(self) -> None:
        for key in list(self.buf):
            self._flush(key)

    def tiles(self) -> list[TileKey]:
        out = []
        for p in self.dir.glob("*.jsonl"):
            iy, ix = p.stem.split("_")
            out.append((int(ix), int(iy)))
        return sorted(out)

    def read(self, key: TileKey) -> list[list]:
        with self._path(key).open(encoding="utf-8") as f:
            return [json.loads(line) for line in f]


def _centre(obj: osmium.osm.Way) -> tuple[float, float] | None:
    lat = lon = 0.0
    n = 0
    nodes = list(obj.nodes)
    if len(nodes) > 2 and nodes[0].ref == nodes[-1].ref:
        nodes = nodes[:-1]  # closed ring: count the first node once
    for nd in nodes:
        if nd.location.valid():
            lat += nd.location.lat
            lon += nd.location.lon
            n += 1
    return (lat / n, lon / n) if n else None


def collect(
    src: Path, spool: _Spool, tile_size: float, location_store: str = "flex_mem"
) -> dict[str, int]:
    """Spool rows: ["a", street, postcode, city, hn, lat, lon] / ["s", name, lat, lon] /
    ["p", name, kind, lat, lon]."""
    stats = {"addresses": 0, "streets": 0, "places": 0}
    seen_streets: set[tuple[TileKey, str]] = set()
    keys = ("addr:housenumber", "name")
    fp = (
        osmium.FileProcessor(str(src))
        .with_locations(location_store)
        .with_filter(osmium.filter.KeyFilter(*keys))
    )
    for obj in fp:
        if obj.is_node():
            if not obj.location.valid():
                continue
            pos: tuple[float, float] | None = (obj.location.lat, obj.location.lon)
        elif obj.is_way():
            pos = None  # computed lazily: most named ways are neither address nor place
        else:
            continue
        tags = obj.tags
        hn = tags.get("addr:housenumber")
        street = tags.get("addr:street") or tags.get("addr:place")
        kind = place_kind(tags)
        hw_name = tags.get("name") if obj.is_way() and tags.get("highway") else None
        if not ((hn and street) or kind or hw_name):
            continue
        if pos is None:
            if hw_name and not (hn or kind):
                # street point: a middle node is enough (and on the road)
                nodes = [nd for nd in obj.nodes if nd.location.valid()]
                pos = (
                    (nodes[len(nodes) // 2].location.lat, nodes[len(nodes) // 2].location.lon)
                    if nodes
                    else None
                )
            else:
                pos = _centre(obj)
            if pos is None:
                continue
        key = tile_of(pos[0], pos[1], tile_size)
        lat, lon = _e5(pos[0]), _e5(pos[1])
        if hn and street:
            spool.add(
                key,
                [
                    "a",
                    street,
                    tags.get("addr:postcode", ""),
                    tags.get("addr:city", ""),
                    hn,
                    lat,
                    lon,
                ],
            )
            stats["addresses"] += 1
        if kind:
            spool.add(key, ["p", tags["name"], kind, lat, lon])
            stats["places"] += 1
        if hw_name and (key, hw_name) not in seen_streets:
            seen_streets.add((key, hw_name))
            spool.add(key, ["s", hw_name, lat, lon])
            stats["streets"] += 1
    spool.close()
    return stats


def _hn_sort(hn: str) -> tuple[int, str]:
    digits = "".join(ch for ch in hn if ch.isdigit())
    return (int(digits[:6]) if digits else 1 << 30, hn)


def tile_doc(rows: list[list]) -> dict:
    groups: dict[tuple[str, str, str], list[tuple[str, int, int]]] = defaultdict(list)
    street_pts: dict[str, tuple[int, int]] = {}
    places: list[list] = []
    seen_places: set[tuple[str, str, int, int]] = set()
    for r in rows:
        if r[0] == "a":
            _, street, pc, city, hn, lat, lon = r
            groups[(street, pc, city)].append((hn, lat, lon))
        elif r[0] == "s":
            street_pts.setdefault(r[1], (r[2], r[3]))
        else:
            k = (r[1], r[2], r[3] // 100, r[4] // 100)  # drop duplicates (node + area, ~1 km)
            if k not in seen_places:
                seen_places.add(k)
                places.append(r[1:])
    s: list[list] = []
    with_addresses = {street for street, _, _ in groups}
    for (street, pc, city), houses in sorted(groups.items()):
        houses = list({h[0].lower(): h for h in reversed(houses)}.values())  # one per number
        houses.sort(key=lambda h: _hn_sort(h[0]))
        hns, dlat, dlon = [], [], []
        plat, plon = houses[0][1], houses[0][2]
        for i, (hn, lat, lon) in enumerate(houses):
            hns.append(hn)
            if i:
                dlat.append(lat - plat)
                dlon.append(lon - plon)
            plat, plon = lat, lon
        s.append([street, pc, city, houses[0][1], houses[0][2], hns, dlat, dlon])
    for name, (lat, lon) in sorted(street_pts.items()):
        if name not in with_addresses:
            s.append([name, "", "", lat, lon, [], [], []])
    return {"v": 1, "s": s, "p": places}


def build_places(
    src: Path, out: Path, tile_size: float = config.TILE_SIZE_DEG, workdir: Path | None = None,
    location_store: str = "flex_mem",
) -> dict:  # fmt: skip
    t0 = time.time()
    tmp = (workdir or out) / "places-spool"
    spool = _Spool(tmp)
    stats = collect(src, spool, tile_size, location_store)
    pdir = out / "places"
    pdir.mkdir(parents=True, exist_ok=True)
    tiles = {}
    for key in spool.tiles():
        doc = tile_doc(spool.read(key))
        data = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        name = f"{key[1]}_{key[0]}.json"
        (pdir / name).write_bytes(data)
        tiles[name] = {"bytes": len(data), "gzip_bytes": len(gzip.compress(data, 6))}
    for p in tmp.glob("*.jsonl"):
        p.unlink()
    tmp.rmdir()
    index = {
        "format": "places", "version": 1, "tile_size_deg": tile_size,
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "attribution": "© OpenStreetMap contributors", "totals": stats, "tiles": tiles,
    }  # fmt: skip
    (pdir / "index.json").write_text(json.dumps(index, indent=1))
    stats["seconds"] = round(time.time() - t0)
    return index
