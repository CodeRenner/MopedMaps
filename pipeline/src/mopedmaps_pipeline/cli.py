"""Command line entry point: ``python -m mopedmaps_pipeline build IN OUT``."""

import argparse
import gzip
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from mopedmaps_pipeline import config
from mopedmaps_pipeline.chunks import HEADER, VERSION, decode_chunk, split_into_chunks, tile_name
from mopedmaps_pipeline.graph import build_graph


def build(src: Path, out: Path, tile_size: float = config.TILE_SIZE_DEG) -> dict:
    """Build tiles + manifest.json from an OSM file. Returns the manifest."""
    from mopedmaps_pipeline.osm_pbf import read_osm  # lazy: needs pyosmium

    t0 = time.monotonic()
    data = read_osm(src)
    t_read = time.monotonic() - t0
    graph = build_graph(data)
    t_graph = time.monotonic() - t0 - t_read
    chunks = split_into_chunks(graph, tile_size)

    out.mkdir(parents=True, exist_ok=True)
    tiles = {}
    total = total_gz = 0
    for key, buf in sorted(chunks.items()):
        name = tile_name(key)
        (out / name).write_bytes(buf)
        _, _, _, _, _, _, n_nodes, n_edges, _ = HEADER.unpack_from(buf, 0)
        gz = len(gzip.compress(buf, 9))
        tiles[name] = {"ix": key[0], "iy": key[1], "bytes": len(buf), "gzip_bytes": gz,
                       "nodes": n_nodes, "edges": n_edges}  # fmt: skip
        total += len(buf)
        total_gz += gz

    manifest = {
        "format": "mmg",
        "version": VERSION,
        "tile_size_deg": tile_size,
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": src.name,
        "attribution": "© OpenStreetMap contributors (ODbL)",
        "totals": {
            "tiles": len(tiles),
            "nodes": len(graph.nodes),
            "edges": len(graph.edges),
            "bytes": total,
            "gzip_bytes": total_gz,
            "max_tile_bytes": max((t["bytes"] for t in tiles.values()), default=0),
            "read_s": round(t_read, 1),
            "graph_s": round(t_graph, 1),
        },
        "tiles": tiles,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    return manifest


def _verify(out: Path) -> None:
    for f in sorted(out.glob("*.mmg")):
        decode_chunk(f.read_bytes())


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="mopedmaps_pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="OSM extract -> tiled graph")
    b.add_argument("input", type=Path, help=".osm.pbf or .osm file")
    b.add_argument("output", type=Path, help="output directory for tiles")
    b.add_argument("--tile-size", type=float, default=config.TILE_SIZE_DEG)
    b.add_argument("--verify", action="store_true", help="decode every tile afterwards")
    args = p.parse_args(argv)

    m = build(args.input, args.output, args.tile_size)
    if args.verify:
        _verify(args.output)
    json.dump(m["totals"], sys.stdout, indent=1)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
