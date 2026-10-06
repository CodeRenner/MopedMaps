# Progress log

Working log for the autonomous build loop. Each iteration reads this file
first, does ONE small runnable increment, then appends an entry below and
updates "Current state". Newest entries at the bottom.

## Current state
- Roadmap step: 1 (pipeline) — in progress
- Next task: run CLI on a real small region (Geofabrik Bremen, ~20 MB) and measure size/time -> extrapolate to Germany
- Branch: `pipeline/graph-chunks` (PR #1 open against main); loop commits go here
- Blockers / questions for the user: permission to download Geofabrik Bremen extract (asked 2026-10-06)
- Environment notes: python3 3.12 available; node/npm, ruff, pytest, osmium
  not installed globally (use a venv for Python tooling)

## Task backlog (step 1)
- [x] Scaffold pipeline package (pyproject, config.py with documented constants)
- [x] OSM tag parsing: access rules, maxspeed parsing, road class, surface, lit
- [x] Graph builder from small test extract (.osm.pbf fixture or synthetic XML)
- [x] Tiling: fixed grid, compact binary chunk format + format spec in docs
- [x] CLI: extract -> tiles
- [ ] Run on a real small region (e.g. Bremen) and measure size
- [ ] Size extrapolation to Germany -> hosting options for user

## Log
### 2026-10-06 — Iteration 0 (setup)
- Read CLAUDE.md and PROJECT_BRIEF.md; resolved open decisions with user
  (see DECISIONS.md).
- Created this log and DECISIONS.md.

### 2026-10-06 — Iteration 1 (pipeline scaffold)
- What: `pipeline/` package (src layout, pyproject with ruff+pytest config),
  `config.py` with tile size (0.25°), routable highway classes, classes that
  need explicit moped permission, default/zone speeds; root `.gitignore`.
- Why: roadmap step 1 foundation; constants centralised per CLAUDE.md.
- Tests: ruff check + format clean; pytest 3 passed.
- Commit: c687fec
- Dev setup: `python3 -m venv .venv && .venv/bin/pip install -e 'pipeline[dev]'`
- Next: tag parsing module.

### 2026-10-06 — Iteration 2 (tag parsing)
- What: `tags.py` — RoadClass/Surface enums (1-byte codes), AccessFlag bitset
  (MOPED, MOFA, MOTORROAD, DESTINATION, ONEWAY, ONEWAY_REVERSE), maxspeed
  parser (numbers, mph, DE zone codes, walk, multi-values -> min,
  directional), access hierarchy access<vehicle<motor_vehicle<moped<mofa.
- Design notes: cycleway/footway/path only open with explicit moped/mofa/
  motor_vehicle permission (generic access=yes does not count). Motorway/trunk
  are NOT excluded here — the vmax<60 rule is applied in the router from road
  class + MOTORROAD flag, as CLAUDE.md requires.
- Tests: ruff clean; pytest 27 passed.
- Commit: 4f5a930
- Next: graph builder.

### 2026-10-06 — Iteration 3 (graph builder)
- What: `osm_xml.py` (stdlib OSM XML reader -> `OsmData`), `geo.py`
  (haversine, bearing, turn angle), `graph.py` (`build_graph`: filters
  routable ways, splits at shared nodes/endpoints, one undirected `Edge` per
  segment with geometry, length, road class, maxspeed fwd/bwd, access flags,
  surface, lit, cycleway, curvature sum, traffic-signal count).
  Fixture `tests/fixtures/small.osm` (synthetic, near Bremen).
- Design notes: edges are stored once; direction handled via ONEWAY flags and
  per-direction maxspeed. Curvature and signals are raw inputs for the
  router's penalties. Gradient + risk score come in later roadmap steps
  (5/6); the binary format will reserve fields for them.
- PBF reading: plan to use pyosmium (BSD-2) as an adapter producing `OsmData`
  (memory: will need a node-location store for Germany; handle in CLI step).
- Tests: ruff clean; pytest 35 passed.
- Commit: 725159a
- Next: tiling + binary chunk format.

### 2026-10-06 — Iteration 4 (tiling + chunk format)
- What: `chunks.py` — grid tiling (`tile_of`, file `{iy}_{ix}.mmg`),
  binary encoder `split_into_chunks` and reference decoder `decode_chunk`.
  Spec in `docs/chunk-format.md` (32-byte header, 8-byte nodes, 36-byte edges,
  zigzag-varint delta geometry).
- Design notes: tile-local node indices + relative to-tile offset (int8) keep
  records small; edges live in the tile of their from-node. Reserved fields for
  ascent/descent (step 6) and risk (step 5) so the format stays v1.
- Tests: ruff clean; pytest 49 passed (round-trip, cross-tile edge, varints).
- Commit: 2932aff
- Next: CLI + real-region size measurement (needs pyosmium + Geofabrik download).

### 2026-10-06 — Iteration 5 (CLI + PBF reader)
- Context: user requested a PR mid-iteration -> created branch
  `pipeline/graph-chunks`, added .DS_Store to .gitignore, opened
  https://github.com/CodeRenner/MopedMaps/pull/1 (iterations 2–4). The loop
  continues on that branch.
- What: `osm_pbf.py` (pyosmium 4.3, BSD-2; keeps only routable ways and the
  tag keys we read; coords via osmium location index `flex_mem`), `cli.py`
  (`python -m mopedmaps_pipeline build IN OUT [--tile-size] [--verify]`)
  writing `.mmg` tiles + `manifest.json` (per-tile bytes/gzip/nodes/edges,
  totals, timings, ODbL attribution).
- Scaling note: whole-Germany in one Python process may exceed GitHub runner
  RAM (7 GB). Decide after measuring Bremen (per-state processing with
  border overlap is the fallback).
- Tests: ruff clean; pytest 51 passed (pyosmium reader == XML reader on fixture).
- Commit: 1b8dc72
- Next: real-region measurement (waiting for download permission).
