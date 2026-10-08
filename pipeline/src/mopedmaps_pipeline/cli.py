"""Command line entry point: ``python -m mopedmaps_pipeline build IN OUT``."""

import argparse
import gzip
import json
import resource
import sys
import tempfile
import time
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from mopedmaps_pipeline import config
from mopedmaps_pipeline.chunks import (
    HEADER,
    VERSION,
    TileKey,
    decode_chunk,
    split_into_chunks,
    tile_name,
)
from mopedmaps_pipeline.graph import build_graph
from mopedmaps_pipeline.traffic import TrafficIndex, load_bw_csv
from mopedmaps_pipeline.traffic_lines import LineIndex, load_sections


def write_tiles(
    tiles: Iterable[tuple[TileKey, bytes]],
    out: Path,
    src: Path,
    tile_size: float,
    timings: dict[str, float],
    extra: dict[str, int],
) -> dict:
    """Write .mmg files and manifest.json; shared by both build modes."""
    out.mkdir(parents=True, exist_ok=True)
    meta = {}
    total = total_gz = nodes = edges = 0
    for key, buf in tiles:
        name = tile_name(key)
        (out / name).write_bytes(buf)
        _, _, _, _, _, _, n_nodes, n_edges, _ = HEADER.unpack_from(buf, 0)
        gz = len(gzip.compress(buf, 9))
        meta[name] = {"ix": key[0], "iy": key[1], "bytes": len(buf), "gzip_bytes": gz,
                      "nodes": n_nodes, "edges": n_edges}  # fmt: skip
        total += len(buf)
        total_gz += gz
        nodes += n_nodes
        edges += n_edges
    manifest = {
        "format": "mmg",
        "version": VERSION,
        "tile_size_deg": tile_size,
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": src.name,
        "attribution": "© OpenStreetMap contributors (ODbL)",
        "totals": {
            "tiles": len(meta),
            "nodes": nodes,
            "edges": edges,
            "bytes": total,
            "gzip_bytes": total_gz,
            "max_tile_bytes": max((t["bytes"] for t in meta.values()), default=0),
            **{f"{k}_s": round(v, 1) for k, v in timings.items()},
            "peak_rss_mb": peak_rss_mb(),
            **extra,
        },
        "tiles": dict(sorted(meta.items())),
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    return manifest


def _traffic(paths: Path | list[Path] | None) -> TrafficIndex | None:
    """BW counting-station CSV (*.csv) and/or section lines (*.jsonl.gz)."""
    if not paths:
        return None
    files = [paths] if isinstance(paths, Path) else paths
    index = TrafficIndex()
    for path in files:
        if path.name.endswith(".jsonl.gz"):
            index.lines = LineIndex(load_sections(path))
            print(f"traffic: {len(index.lines)} section lines from {path.name}", file=sys.stderr)
        else:
            index.by_ref = load_bw_csv(path).by_ref
            print(f"traffic: {len(index)} counting stations from {path.name}", file=sys.stderr)
    return index


def build(
    src: Path,
    out: Path,
    tile_size: float = config.TILE_SIZE_DEG,
    dem_dir: Path | None = None,
    traffic_csv: Path | list[Path] | None = None,
) -> dict:
    """In-memory build (small extracts). Returns the manifest."""
    from mopedmaps_pipeline.osm_pbf import read_osm  # lazy: needs pyosmium

    clock = _Clock()
    data = read_osm(src)
    clock.lap("read")
    graph = build_graph(data, _traffic(traffic_csv))
    clock.lap("graph")
    no_dem = len(graph.edges)
    if dem_dir is not None:
        from mopedmaps_pipeline.dem import Dem
        from mopedmaps_pipeline.elevation import apply_elevation

        graph, no_dem = apply_elevation(graph, Dem(dem_dir))
    clock.lap("elevation")
    chunks = split_into_chunks(graph, tile_size)
    return write_tiles(
        sorted(chunks.items()), out, src, tile_size, clock.laps,
        {"edges_without_elevation": no_dem},
    )  # fmt: skip


def build_streaming(
    src: Path,
    out: Path,
    tile_size: float = config.TILE_SIZE_DEG,
    dem_dir: Path | None = None,
    workdir: Path | None = None,
    node_index: str = "mem",
    delete_source: bool = False,
    traffic_csv: Path | list[Path] | None = None,
) -> dict:
    """Streaming build with bounded memory (country-sized extracts).

    `node_index="mem"` keeps the node location index in RAM (~1 GB for
    Germany after the pre-filter; the on-disk index made the edge pass
    I/O-bound). `delete_source` removes the input PBF after the pre-filter to
    save disk on CI runners.
    """
    from mopedmaps_pipeline import streaming as st

    clock = _Clock()
    with tempfile.TemporaryDirectory(dir=workdir, prefix="mmg-build-") as tmp_name:
        tmp = Path(tmp_name)
        filtered = tmp / "filtered.osm.pbf"
        st.prefilter(src, filtered)
        if delete_source:
            src.unlink()
        clock.lap("prefilter")
        junctions = st.junction_ids(filtered)
        clock.lap("junctions")
        spool = st.TileSpool(tmp / "spool")
        store = "flex_mem" if node_index == "mem" else f"sparse_file_array,{tmp / 'nodes.idx'}"
        stats = st.stream_edges(filtered, junctions, spool, store, tile_size, _traffic(traffic_csv))
        del junctions
        clock.lap("edges")
        heights = None
        if dem_dir is not None:
            from mopedmaps_pipeline.dem import Dem

            heights = st.stream_heights(spool, Dem(dem_dir))
        clock.lap("elevation")
        tiles = ((ti.key, ti.data) for ti in st.assemble(spool, tile_size, heights))
        missing = 0 if heights is None else int(np.isnan(heights[1]).sum())
        return write_tiles(
            tiles, out, src, tile_size, clock.laps,
            {"skipped_incomplete_ways": stats["skipped_incomplete"],
             "nodes_without_elevation": missing if heights is not None else -1},
        )  # fmt: skip


def peak_rss_mb() -> int:
    """Peak resident memory of this process so far (macOS: bytes, Linux: KiB)."""
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return round(rss / 1e6) if sys.platform == "darwin" else round(rss / 1024)


class _Clock:
    """Per-phase wall time and peak memory, reported in the manifest."""

    def __init__(self) -> None:
        self.t = time.monotonic()
        self.laps: dict[str, float] = {}
        self.peak_mb: dict[str, int] = {}

    def lap(self, name: str) -> None:
        now = time.monotonic()
        self.laps[name] = now - self.t
        self.peak_mb[name] = peak_rss_mb()
        self.t = now
        print(
            f"[build] {name}: {self.laps[name]:.1f} s, peak {self.peak_mb[name]} MB",
            file=sys.stderr,
        )


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
    b.add_argument("--dem", type=Path, help="directory with Copernicus GLO-30 tiles")
    b.add_argument(
        "--traffic", type=Path, action="append",
        help="per-edge traffic volume: BW counting-station CSV and/or section lines "
        "(*.jsonl.gz from traffic_lines); repeatable",
    )  # fmt: skip
    b.add_argument(
        "--streaming", action="store_true", help="bounded-memory build for large extracts"
    )
    b.add_argument("--workdir", type=Path, help="where to put temp files (streaming mode)")
    b.add_argument(
        "--node-index", choices=["mem", "disk"], default="mem",
        help="node location index in RAM (default) or on disk (streaming mode)",
    )  # fmt: skip
    b.add_argument(
        "--delete-source", action="store_true",
        help="delete the input file after the pre-filter (streaming mode, saves disk on CI)",
    )  # fmt: skip
    z = sub.add_parser("plz", help="GeoNames DE.zip -> bundled PLZ table (JSON)")
    z.add_argument("input", type=Path, help="GeoNames DE.zip")
    z.add_argument("output", type=Path, help="output .json")
    d = sub.add_parser("dem-fetch", help="download Copernicus GLO-30 tiles for a bounding box")
    d.add_argument("output", type=Path, help="directory for the .tif tiles")
    d.add_argument(
        "--bbox", type=int, nargs=4, metavar=("SOUTH", "WEST", "NORTH", "EAST"),
        help="integer degrees, north/east exclusive (default: Germany 47 5 55 16)",
    )  # fmt: skip
    args = p.parse_args(argv)

    if args.cmd == "dem-fetch":
        from mopedmaps_pipeline.dem import GERMANY_BBOX, fetch_tiles, tiles_for_bbox

        stats = fetch_tiles(tiles_for_bbox(*(args.bbox or GERMANY_BBOX)), args.output)
        print(json.dumps(stats))
        return 0

    if args.cmd == "plz":
        from mopedmaps_pipeline.plz import aggregate, read_geonames_zip, write_table

        rows = aggregate(read_geonames_zip(args.input))
        write_table(rows, args.output)
        print(f"{len(rows)} PLZ -> {args.output} ({args.output.stat().st_size} bytes)")
        return 0

    if args.streaming:
        m = build_streaming(
            args.input, args.output, args.tile_size, args.dem, args.workdir,
            args.node_index, args.delete_source, args.traffic,
        )  # fmt: skip
    else:
        m = build(args.input, args.output, args.tile_size, args.dem, args.traffic)
    if args.verify:
        _verify(args.output)
    json.dump(m["totals"], sys.stdout, indent=1)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
