"""Write .mmg chunks + expected decoded JSON for the TypeScript decoder tests.

Run from repo root: .venv/bin/python pipeline/scripts/make_web_fixtures.py
"""

import json
from dataclasses import asdict
from pathlib import Path

from mopedmaps_pipeline.chunks import decode_chunk, split_into_chunks, tile_name
from mopedmaps_pipeline.graph import build_graph
from mopedmaps_pipeline.osm_xml import read_osm_xml

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "pipeline" / "tests" / "fixtures"
OUT = ROOT / "web" / "test" / "fixtures"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for osm in ("small.osm", "cross_tile.osm"):
        chunks = split_into_chunks(build_graph(read_osm_xml(SRC / osm)))
        for key, buf in chunks.items():
            name = f"{osm.removesuffix('.osm')}_{tile_name(key)}"
            (OUT / name).write_bytes(buf)
            c = decode_chunk(buf)
            expected = {
                "key": list(c.key),
                "tileSize": c.tile_size,
                "nodes": [list(n) for n in c.nodes],
                "edges": [
                    {k: (list(v) if isinstance(v, tuple) else v) for k, v in asdict(e).items()}
                    | {"shape": [list(p) for p in e.shape]}
                    for e in c.edges
                ],
            }
            (OUT / f"{name}.json").write_text(json.dumps(expected, indent=1))
            print("wrote", name)


if __name__ == "__main__":
    main()
