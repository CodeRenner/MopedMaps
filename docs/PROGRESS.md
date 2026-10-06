# Progress log

Working log for the autonomous build loop. Each iteration reads this file
first, does ONE small runnable increment, then appends an entry below and
updates "Current state". Newest entries at the bottom.

## Current state
- Roadmap step: 1 (pipeline) — done except band-wise Germany build; step 2 (router) — starting
- Next task: A* search (binary heap, admissible heuristic) + fixed start/destination tests
- Branches: `pipeline/graph-chunks` = PR #1 (step 1, pushed). `router/astar` (local, based on it) = step 2 work
- Blockers / questions for the user: none
- Environment notes: python3 3.12 available; node/npm, ruff, pytest, osmium
  not installed globally (use a venv for Python tooling).
  Node 22 in ~/.local/node — prefix commands with `export PATH="$HOME/.local/node/bin:$PATH"`

## Task backlog (step 1)
- [x] Scaffold pipeline package (pyproject, config.py with documented constants)
- [x] OSM tag parsing: access rules, maxspeed parsing, road class, surface, lit
- [x] Graph builder from small test extract (.osm.pbf fixture or synthetic XML)
- [x] Tiling: fixed grid, compact binary chunk format + format spec in docs
- [x] CLI: extract -> tiles
- [x] Run on a real small region (Bremen) (e.g. Bremen) and measure size
- [x] Size extrapolation to Germany -> hosting options for user
- [ ] Memory-efficient Germany build (band-wise), needed before step 8

## Task backlog (step 2)
- [x] Scaffold `web/` (TypeScript, vitest, no framework), shared config constants
- [x] TS chunk decoder mirroring chunks.py; cross-language fixture test
- [x] Graph assembly from multiple chunks (global node ids = tile+index)
- [x] Vehicle profile + access rules (vmax<60 motorway/motorroad rule as documented config)
- [x] Edge cost: time = f(length, min(speed, vmax), curvature/junction/signal penalties)
- [ ] A* (binary heap, haversine/vmax heuristic) + fixed start/destination tests
- [ ] Worker wrapper (no DOM in router core)

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

### 2026-10-06 — Iteration 6 (real-region measurement)
- User approved downloading Geofabrik Bremen (20 MB) and installing Node.js.
- What: built Bremen: 5 tiles, 59.5k edges, 2.9 MB raw / 1.35 MB gzip,
  5.7 s, 245 MB RAM. Write-up + Germany extrapolation in
  `docs/size-measurement.md` (~640 MB raw / ~300 MB gzip, ~800 tiles,
  largest tile a few MB; single-process RAM ~50 GB -> needs band-wise build).
- Node.js install via Homebrew failed: /opt/homebrew not writable by user
  `ai` (owned by another account). Not fixing permissions myself.
- Tests: unchanged (51 passed); doc-only commit.
- Commit: 49a5b2d
- Next: hosting decision from user; Node.js for step 2.

### 2026-10-06 — Iteration 6b (decisions)
- User decided: hosting = Cloudflare Pages; Node via tarball in ~/.local/node.
- Installed Node v22.23.3 (darwin-arm64, SHA-256 verified against nodejs.org
  SHASUMS256.txt). Recorded both in DECISIONS.md. Added step-2 backlog.
- Next: web/ scaffold + TS chunk decoder.

### 2026-10-06 — Iteration 7 (web scaffold + TS chunk decoder)
- Branch: new local branch `router/astar` (on top of PR #1 branch) so step 2
  becomes its own PR.
- What: `web/` package (TypeScript strict, vitest; deps typescript Apache-2.0,
  vitest MIT, @types/node MIT — dev only). `src/router/chunk.ts` decoder +
  enums mirroring the Python side. `pipeline/scripts/make_web_fixtures.py`
  writes `.mmg` + expected JSON (from the Python decoder) into
  `web/test/fixtures/`; TS test compares field by field. New fixture
  `cross_tile.osm`.
- Tests: tsc clean; vitest 6 passed; ruff clean; pytest 51 passed.
- Commit: 7722ba0
- Next: multi-chunk graph assembly.

### 2026-10-06 — Iteration 8 (graph assembly)
- What: `web/src/router/graph.ts` — `assembleGraph(chunks)`: dense global
  node ids (per-tile offsets), keeps edges whose to-tile is loaded, builds
  directed arcs in CSR typed arrays (target, edge index, forward bit);
  ONEWAY / ONEWAY_REVERSE decide arc existence. `nearestNode` (linear scan
  over connected nodes; spatial index later if needed).
- Note: access per vehicle (moped/mofa, motorway rule) is NOT applied at
  assembly; it is applied per query in the cost function so profile changes
  need no rebuild.
- Tests: tsc clean; vitest 11 passed.
- Commit: c865c41
- Next: profile + cost model.

### 2026-10-06 — Iteration 9 (profile, access, cost)
- What: `web/src/config/index.ts` (vmax presets 25/45, radius 25–100 default
  75, MOFA_MAX_VMAX 25, MOTORWAY_MIN_VMAX 60, default speeds by class,
  surface factors, penalties) and `web/src/router/profile.ts` (`canUse`,
  `speedKmh`, `travelTimeS`, `edgeCost`). Model documented in
  `docs/routing-model.md`.
- Design notes: urban/rural unknown in graph -> per-class defaults; listed as
  known gap. Cost = a*time for now; b*risk / c*energy hooks for steps 5/6.
- Tests: tsc clean; vitest 19 passed.
- Commit: 794fffc
- Next: A*.
