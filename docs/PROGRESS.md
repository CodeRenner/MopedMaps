# Progress log

Working log for the autonomous build loop. Each iteration reads this file
first, does ONE small runnable increment, then appends an entry below and
updates "Current state". Newest entries at the bottom.

## Current state
- Roadmap step: 1 done (except band-wise Germany build); 2 done (PR #2, branch `router/astar`); 3 done (PR #3, branch `data/plz-chunks`); 4 done (PR #4, branch `ui/map-frontend`); 5 done (PR #5, branch `safety/risk-score`); 6 done (PR #6, branch `energy/elevation`); 7 done (PR #7, branch `pwa/offline`); 8 done (PR #8, branch `docs/release`) — all roadmap steps implemented
- Roadmap 1–8 merged into main (2026-10-07). Now: user-requested features (step 9), one branch + PR each:
  - `feature/elevation-profile`: node heights in chunks (format v2) + route climb from profile with hysteresis
  - `feature/route-chart`: line chart speed + elevation over distance
  - `feature/range`: battery/tank capacity + real consumption calibration, range/reserve display
- Step 9 merged (PRs #11, #12, #13, 2026-10-07). Open: "Graph build" run for v2 tiles (node heights) on the live site.
- Next task (if continuing): items from "Later / improvements" (snap to largest component, risk tuning)
- Germany graph (v1) live on mopedmaps.pages.dev since 2026-10-07 (run 37621466950)
- Branches: `pipeline/graph-chunks` = PR #1 (step 1). `router/astar` = PR #2 (step 2, stacked on #1). `data/plz-chunks` = PR #3 (step 3, stacked on #2). `ui/map-frontend` = PR #4 (step 4, stacked on #3). `safety/risk-score` = PR #5 (step 5, stacked on #4). `energy/elevation` = PR #6 (step 6, stacked on #5). `pwa/offline` = PR #7 (step 7, stacked on #6). `docs/release` = PR #8 (step 8, stacked on #7)
- Blockers / questions for the user (asked 2026-10-07, not blocking current work):
  - ~~Cloudflare secrets~~ done 2026-10-07 (both present in repo secrets)
  - Pages project: `mopedmaps` (default, no other name given); app + tiles in one project (user decided 2026-10-07)
  - LICENSE holder name ("MopedMaps contributors" for now)
  - Review/merge PRs #1–#7 (stacked, bottom-up)
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
- [x] A* (binary heap, haversine/vmax heuristic) + fixed start/destination tests
- [x] Worker wrapper (no DOM in router core)

## Task backlog (step 3)
- [x] PLZ table: pipeline script GeoNames DE.zip -> compact `plz.json`/binary (download approved 2026-10-07)
- [x] PLZ lookup module in web (exact + prefix search), tests
- [x] Tiles-in-radius computation (circle vs tile rectangles), uses manifest
- [x] Chunk loader: fetch with retry, IndexedDB cache keyed by build version, re-fetch when evicted (iOS)
- [x] Wire loader -> worker `load`

## Task backlog (step 4)
- [x] Vite app shell, MapLibre map (OpenFreeMap style from config), attribution (OSM, GeoNames, basemap)
- [x] i18n module (de first, en), all UI strings via i18n files
- [x] PLZ input + radius slider -> loadArea with progress; area circle on map
- [x] Tap to set start/destination, route request via WorkerRouterPort, draw route + summary
- [x] Profile settings (vmax presets 25/45 + free input, drive type), persisted locally
- [x] Mobile UX: collapse area panel after loading (attribution kept fully visible for ODbL compliance)
- [x] Size budget check (bundle size) and older-iPhone sanity (ES2020, no heavy deps)

## Task backlog (step 5)
- [x] Risk model doc + constants (pipeline config): fast rural roads w/o cycleway, no lighting, bad surface, many junctions/signals; bonus for 30/50 side streets
- [x] Pipeline: compute per-edge risk (0–255) into the reserved byte; tests; rebuild Bremen + web fixtures
- [x] Router: cost = a·time + b·risk·length + c·energy (risk per km), heuristic stays admissible; tests
- [x] UI: sliders a/b (c later in step 6), instant reroute; route summary shows risk indicator
- [x] Browser check, then PR #5

## Task backlog (step 7)
- [x] Web app manifest (name, icons, theme, standalone, start_url), apple-touch-icon + iOS meta tags, generated icons (no third-party artwork)
- [x] Service worker (hand-written, no extra deps): precache app shell (hashed Vite assets via build manifest) + plz.json; network-first for graph manifest
- [x] Offline start: if the basemap style cannot load, fall back to a minimal local style (background + route/area layers only) so routing still works with cached graph chunks
- [x] Ask the browser for persistent storage (navigator.storage.persist) after loading an area; show storage note on iOS
- [x] Offline test in the browser (server stopped), then PR #7
- Note: no bulk prefetching of OpenFreeMap tiles (respect their usage policy); full offline basemap comes with own PMTiles later

## Task backlog (step 8)
- [x] LICENSE (MIT, decided) + README (EN): what/why, features, architecture, dev setup, data sources & attribution, limitations
- [x] THIRD_PARTY / data notices (DATA_SOURCES.md) (ODbL, CC BY 4.0 GeoNames, Copernicus DEM, OpenFreeMap/OpenMapTiles)
- [x] CI workflow: ruff + pytest (pipeline), tsc + vitest + vite build (web) on PRs
- [ ] Streaming Germany build (decided 2026-10-07):
  - [x] Pass 1: routable way refs -> sorted junction id array (numpy), test == build_graph junctions
  - [x] Pass 2: ways with on-disk locations -> split at junctions -> edge rows into per-tile temp files + junction (id, lat, lon, tile) list
  - [x] Pass 0: pre-filter PBF (routable highway ways + referenced nodes + signal nodes) so the on-disk location index only holds road nodes (DE estimate otherwise ~7 GB index + 4.4 GB PBF + ~3 GB spool > runner disk)
  - [x] Assemble tiles from temp files (local indices by sorted id per tile), identical output to current build on Bremen
  - [x] Elevation in streaming mode (node heights + smoothing with neighbour lookups per tile band)
  - [x] CLI `build --streaming` (temp workdir, cleaned up)
  - [x] DEM at country scale: sample grouped by 1° tile + evict (else ~60 tiles × 35 MB in RAM)
  - [x] Prefilter memory: measured on Germany — 1.14 GB peak (bounded), keep BackReferenceWriter
  - [x] Measure on all of Germany: 103 min, peak 1.58 GB, 844 tiles, 903 MB / 490 MB gzip, max tile 4.87 MB
  - [x] Faster edge pass: node index in RAM (`flex_mem`, ~1 GB) instead of on-disk sparse_file_array (pass was I/O-bound, CPU 32 %)
  - [x] Compact binary spool rows instead of pickled Edge objects (Bremen 14 -> 9.4 MB)
  - [x] `--delete-source` to free 4.5 GB after the pre-filter (e.g. Niedersachsen or Hessen): time, peak RAM, disk
- [x] DEM fetch tool for the Action (`dem-fetch`)
- [x] Monthly graph-build Action + Cloudflare Pages deploy workflow (secrets present)

## Task backlog (step 9 — user requests 2026-10-07)
- [x] Format v2: per-node height (int16, decimetres, INT16_MIN = unknown) written by both builds; TS + Python decoders read v1 and v2; spec updated
- [x] Router returns route profile (cumulative distance, node heights, per-edge speed); climb in summary from profile with hysteresis (config)
- [x] Rebuild Bremen tiles + fixtures; check of climb on flat routes -> PR
- [x] Route chart data model (pure): speed steps, downsampled elevation, ticks, readout, SVG paths
- [x] Route chart view: SVG line chart, x = distance, y = speed (km/h) + elevation (m), collapsible panel, touch/hover readout, de/en -> PR
- [x] Range model (pure): capacity, real-consumption calibration factor, range estimate, settings storage
- [x] Profile panel: inputs for capacity (Wh / l) and real consumption (Wh/km / l/100 km), de/en
- [x] Route summary: share of battery/tank used, remaining range estimate, warning below reserve (config) -> PR

## Later / improvements (found during checks)
- [ ] Snap start/target only to the largest connected component (taps near the data border hit isolated fragments -> "unreachable")
- [ ] (moved to step 9) Range hint
- [ ] (moved to step 9) Route climb noise
- [ ] Risk tuning: junction density dominates on short urban edges
- [ ] Memory-efficient band-wise build for all of Germany (needed before step 8)

## Task backlog (step 6)
- [x] DEM: download GLO-30 tiles (N52/N53 × E008/E009), sampler with bilinear interpolation, tests on synthetic raster
- [x] Pipeline: ascent/descent per edge (graph-smoothed node heights, see docs/elevation.md) into bytes 22–25; rebuild
- [x] Router: energy model — electric Wh/km by speed + gradient, combustion l/100km; c·energy in cost; documented constants
- [x] UI: energy slider c, summary shows Wh or litres + range hint; elevation attribution
- [x] Browser check, then PR #6

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

### 2026-10-06 — Iteration 10 (A* router)
- What: `web/src/router/astar.ts` (`findRoute`: A* with lazy-deletion binary
  heap `heap.ts`, heuristic = haversine / vmax × time weight, admissible;
  returns nodes, arcs, cost, time, distance, full polyline incl. reversed
  shapes, settled count; `heuristic: false` = Dijkstra reference), `geo.ts`.
- Tests: synthetic square (signals avoided, motorway only for vmax>=60),
  pipeline fixture (Mofa-frei cycleway only for vmax 25; reversed geometry),
  Bremen fixed pairs (skipped automatically when `data/tiles-bremen` is
  absent, e.g. in CI): Hbf->Vegesack 19.9 km / 44.4 min (17 ms),
  Hbf->Uni 5.5 km / 14.7 min, Neustadt->Hemelingen 7.4 km / 17.9 min; no
  motorway/motorroad edges for the 45 km/h moped; A* cost == Dijkstra cost
  with fewer settled nodes.
- Fix during iteration: avoided `Array.prototype.at` (ES2022) to keep the
  ES2020 target for older iPhones.
- Tests: tsc clean; vitest 30 passed.
- Commit: 992b828
- Next: worker wrapper.

### 2026-10-06 — Iteration 11 (worker wrapper) — step 2 complete
- What: `protocol.ts` (typed request/response union: load, route, no-route
  with reason, error), `service.ts` (`RouterService`: assembles graph from
  ArrayBuffers, snaps start/target within `MAX_SNAP_DISTANCE_M` = 1000 m,
  validates profile, returns geometry + timings; never throws across the
  boundary), `worker.ts` (thin `onmessage` adapter). Config constant added.
- Tests: tsc clean; vitest 34 passed.
- Commit: ae75e69
- Next: roadmap step 3 (PLZ + chunk loading). Step 2 PR: asking user
  whether to push `router/astar` and open PR #2 (base: PR #1 branch).

### 2026-10-07 — Iteration 11b (PR #2)
- User approved: push + PR for step 2, and from now on push/open PRs
  automatically when a roadmap step completes (recorded in DECISIONS.md).
  Also approved GeoNames DE.zip download.
- Opened https://github.com/CodeRenner/MopedMaps/pull/2 (base
  `pipeline/graph-chunks`). Created local branch `data/plz-chunks` for step 3.
- Next: PLZ table script.

### 2026-10-07 — Iteration 12 (PLZ table)
- What: downloaded GeoNames `DE.zip` (375 KB, CC BY 4.0) to `data/`.
  `plz.py` aggregates rows per PLZ (mean of distinct points, most frequent
  name), CLI `python -m mopedmaps_pipeline plz IN.zip OUT.json`. Generated
  `web/public/data/plz.json`: 10,813 PLZ (incl. large-customer PLZs),
  460 KB raw / 161 KB gzip. Data README with licence + rebuild command.
  Spot checks: 28195 Bremen, 10115 Berlin, 80331 München.
- Tests: ruff clean; pytest 53 passed.
- Commit: 963e51c
- Next: PLZ lookup in web.

### 2026-10-07 — Iteration 13 (PLZ lookup)
- What: `web/src/location/plz.ts` — `PlzIndex` (validates sorted v1 table;
  `get` exact; `search` = binary-search digit prefix, or name prefix /
  contains (>=3 chars) with umlaut/ß/diacritic normalisation, prefix first).
- Tests: tsc clean; vitest 45 passed (incl. bundled plz.json sanity: >8000
  entries, attribution, spot checks, all coords inside DE bbox).
- Commit: 8983b16
- Next: tiles in radius.

### 2026-10-07 — Iteration 14 (tiles in radius)
- What: `web/src/data/manifest.ts` (types, `parseManifest`, `buildId` for
  cache invalidation) and `web/src/location/tiles.ts` (`tilesInRadius`:
  bounding box then closest-point-of-rectangle haversine test;
  `planTiles`: filter by manifest, sort nearest first, raw/gzip totals for
  a download-size hint in the UI).
- Tests: property test (2000 random points within radius always covered;
  every returned tile actually within radius), monotonic in radius, 75 km
  around Bremen in 40–90 tiles. tsc clean; vitest 51 passed.
- Hiccup: an ad-hoc vitest run with `--root /` scanned the whole disk and was
  stopped; no repo impact.
- Commit: 3668518
- Next: chunk loader + IndexedDB.

### 2026-10-07 — Iteration 14b (fix: ignored files)
- Found: `.gitignore` pattern `data/` matched every `data/` dir, so
  `web/public/data/plz.json` + README (iteration 12 — its log entry wrongly
  said they were committed) and `web/src/data/manifest.ts` (iteration 14)
  were untracked. Changed to `/data/` (root only), committed the files.
- Lesson: check `git status` / `git show --stat` after each commit.
- Tests: tsc clean; vitest 51 passed.
- Commit: 37c6851

### 2026-10-07 — Iteration 15 (chunk loader + IndexedDB)
- What: `web/src/data/store.ts` (`ChunkStore` interface; `MemoryStore`;
  `IdbStore` — object store keyed `buildId|name`, `prune(keep)` drops old
  builds) and `web/src/data/loader.ts` (`loadChunks`: cache-first, fetch
  with exponential-backoff retry (3), no retry on 4xx, concurrency 4,
  progress callback, AbortSignal; cache read/write failures are ignored so
  iOS eviction or quota errors just trigger a re-download).
- Dev dep: fake-indexeddb (Apache-2.0). tsconfig default lib now DOM
  (worker.ts keeps its webworker reference).
- Tests: tsc clean; vitest 57 passed.
- Commit: e941ac6
- Next: AreaLoader glue, then step 3 PR.

### 2026-10-07 — Iteration 16 (area loader) — step 3 complete
- What: `web/src/router/port.ts` (`RouterPort`; `LocalRouterPort` in-process,
  `WorkerRouterPort` id-correlated postMessage with transferables) and
  `web/src/data/area.ts` (`loadArea`: PLZ or coords -> clamp radius 25–100
  -> `planTiles` -> `loadChunks` -> router `load` (transfers copies so the
  cache keeps its buffers) -> prune old builds; typed `AreaError` codes).
- Tests: fixture end-to-end (load, route, second load from cache), unknown
  PLZ / no tiles, radius clamp; Bremen end-to-end with real plz.json +
  manifest (local data only). tsc clean; vitest 61 passed; pytest 53 passed.
- Commit: ccb82d6
- Next: push `data/plz-chunks`, open PR #3 (auto, per DECISIONS); then step 4.

### 2026-10-07 — Iteration 16b (PR #3 + step 4 decisions)
- Pushed `data/plz-chunks`, opened https://github.com/CodeRenner/MopedMaps/pull/3
  (base `router/astar`), automatically per DECISIONS.
- User decided: basemap = OpenFreeMap first, own PMTiles later; bundler = Vite.
  Recorded in DECISIONS.md; step 4 backlog added; branch `ui/map-frontend`.

### 2026-10-07 — Iteration 17 (app shell + map)
- What: Vite 8 (MIT, dev) + maplibre-gl 6.13 (BSD-3). `index.html`,
  `src/main.ts`, `src/ui/map.ts` (map with OpenFreeMap "liberty" style from
  config, compact attribution incl. OSM/ODbL + GeoNames/CC BY 4.0,
  zoom control), `src/ui/attribution.ts`, config: BASEMAP_STYLE_URL,
  initial view, GRAPH_BASE_URL, PLZ_TABLE_URL. `vite.config.ts` (ES2020,
  sourcemaps; vitest config). `.claude/launch.json` for the dev server.
- Licences (production deps): MIT 11, ISC 8, BSD-3 3, BSD-2 2,
  MIT-or-Apache 1 (+ our own private package). ISC is permissive and
  MIT-equivalent -> considered compatible.
- Bundle: JS 1.04 MB / 281 KB gzip (almost all MapLibre), CSS 11 KB gzip.
  Warning limit raised to 1200 KB with a comment.
- Tests: tsc clean; vitest 63 passed (new: attribution + "no OSM tile
  server" compliance test). `vite build` OK.
- Visual check: NOT done yet — the in-app preview stayed in "starting" /
  "Policy check in progress" (probably waiting for user approval). Vite
  itself starts fine when run directly (HTTP 200).
- Commit: ac73846
- Next: i18n.

### 2026-10-07 — Iteration 18 (i18n)
- What: `web/src/i18n/{de,en}.json` (strings for area, route, profile,
  errors incl. every AreaError / NoRouteReason code) and `i18n/index.ts`
  (`detectLocale` with German default, `translate` with {param}
  interpolation and de/key fallback, `formatNumber` via Intl, global `t`).
  main.ts sets locale, <html lang> and title.
- Preview: dev server now "running" but the Browser pane denies navigation
  to localhost:5173 -> recorded as blocker for the user; continuing without
  visual checks.
- Tests: tsc clean; vitest 68 passed (key + placeholder parity de/en).
- Commit: ad03947
- Next: PLZ panel.

### 2026-10-07 — Iteration 19 (PLZ panel + app wiring)
- What: `location/circle.ts` (geodesic circle polygon + bounds),
  `ui/messages.ts` (pure error->i18n key, MB/summary formatting),
  `ui/areaPanel.ts` (PLZ input with datalist suggestions — accepts PLZ,
  "PLZ Ort" or a place name —, radius slider 25–100 step 5, status line),
  `app.ts` (loads plz.json, IndexedDB store with in-memory fallback,
  router in a module Worker via `WorkerRouterPort`, manifest on demand,
  `loadArea` with progress, dashed area circle + fitBounds), main.ts boots
  the app after map load. CSS: 16px inputs (no iOS zoom), safe-area inset.
- Dev data: `web/public/graph` symlink -> `data/tiles-bremen` (gitignored).
- Build: worker chunk 6.9 KB; main 1.05 MB / 286 KB gzip.
- Tests: tsc clean; vitest 72 passed. Visual check still blocked (preview
  navigation denied).
- Commit: 22fbbaa
- Next: route interaction.

### 2026-10-07 — Iteration 20 (tap to route)
- What: `ui/routePicker.ts` (pure state machine: 1st tap start, 2nd target
  -> route, 3rd restarts; hint keys), `ui/routeLayer.ts` (green/red markers,
  route line with white casing), app wiring: clicks only after an area is
  loaded; stale responses dropped via a sequence counter; summary
  "x km · y min" or localized no-route reason. Uses DEFAULT_PROFILE until the
  settings panel exists.
- Tests: tsc clean; vitest 74 passed. Build 291 KB gzip. Visual check
  still blocked (preview navigation denied).
- Commit: 5e3b37c
- Next: profile settings.

### 2026-10-07 — Iteration 21 (profile settings)
- What: `ui/profileStore.ts` (pure `parseVmax` accepting "45,5", range
  6–200; `loadProfile`/`saveProfile` with injected storage, defaults on
  corrupt/invalid/blocked storage — localStorage is fine here: per-device
  convenience, not critical data), `ui/profilePanel.ts` (collapsible
  <details>: preset buttons 25/45 with aria-pressed, free vmax input with
  localized validation hint, drive radios), app: profile used for routing,
  saved on change, current route recomputed.
- Tests: tsc clean; vitest 86 passed. Build 292 KB gzip.
- Commit: 88f0c90
- Next: size budget check, then step 4 PR.

### 2026-10-07 — Iteration 21b (first visual check + fix)
- User started localhost; Browser pane navigation now allowed.
- Bug found: map stayed blank — "Worker failed to load" from MapLibre.
  Cause: MapLibre 6 loads `maplibre-gl-worker.mjs` relative to its module;
  Vite dev pre-bundling relocates it. Fix: `setWorkerUrl(...?url)` in
  `ui/map.ts` (also emits the worker as its own asset in builds, 508 KB).
- Verified in the browser (desktop 800x600 + mobile 375x812):
  map + OpenFreeMap style + attributions OK; PLZ 28195, radius 25 ->
  "25 km Umkreis geladen · Download ca. 1,1 MB", dashed circle + fitBounds;
  two taps in Bremen -> route line, "12,6 km · 30 min" (45 km/h);
  switching to 25 km/h preset rerouted -> "12,4 km · 41 min".
- UX notes (added to backlog): on phones the expanded panels cover about half
  the map and the attribution wraps to 3 lines.
- Data note: local test graph is state Bremen only; Lower Saxony towns in
  the circle have no graph yet.
- Tests: vitest 86 passed.
- Commit: 451e7be

### 2026-10-07 — Iteration 22 (mobile UX, startup, budget) — step 4 complete
- What: area panel collapses to the status line + "Ändern" button after an
  area is loaded; compact padding under 480 px; app UI starts on
  `style.load` (panel visible after ~2 s instead of ~13 s). Attribution
  left fully expanded on purpose (OSM attribution must stay visible).
- Verified in browser at 375x812: panel collapse, persisted 25 km/h
  profile survived reload, area load PLZ 28195 / 75 km ("1,3 MB").
- `docs/frontend-budget.md`: first load ≈ 606 KB gzip (MapLibre ≈ 95 % of
  JS; our router worker 3 KB); WebGL2 + module workers -> iOS 15+;
  offline start not possible yet (basemap style from network) -> step 7.
- Tests: vitest 86 passed; build OK.
- Commits: 15b65c3 (+ this log/doc commit)
- Next: push `ui/map-frontend`, open PR #4; then step 5.

### 2026-10-07 — Iteration 22b (PR #4)
- Opened https://github.com/CodeRenner/MopedMaps/pull/4 (base `data/plz-chunks`),
  automatically per DECISIONS. Branch `safety/risk-score` for step 5; backlog added.

### 2026-10-07 — Iteration 23 (risk model)
- What: `RISK_*` constants in pipeline config, `risk.py` (`risk_score(edge)`
  0..255 from speed limit/class default, road class, missing cycleway on
  >=70 km/h roads, lighting, surface, signals/km, junction density/km
  capped), `docs/risk-model.md` with formula, table, examples and gaps
  (speed differential to vmax could be added at runtime later).
- Tests: ruff clean; pytest 62 passed (exact values, monotonicity, clamping,
  constants cover every enum member).
- Commit: ec69558
- Next: encode risk into chunks.

### 2026-10-07 — Iteration 24 (risk in chunks)
- What: `split_into_chunks` writes `max(1, risk_score(e))` into byte 26
  (format stays v1; 0 still means "not computed"). Spec updated.
  Regenerated web fixtures and local Bremen tiles.
- Bremen distribution (59,515 edges): min 24, p10 55, median 70, p90 95,
  max 255. Tuning note: junction density (capped +30) dominates on short
  urban edges — revisit after seeing routes with b > 0.
- Size: Bremen gzip 1.346 -> 1.391 MB (+3 %, risk byte less compressible).
- Tests: pytest 62 passed; vitest 86 passed.
- Commit: 3f8466e
- Next: risk in router cost.

### 2026-10-07 — Iteration 25 (risk in router)
- What: `edgeRisk(e) = risk × km`; `edgeCost = a·time + b·edgeRisk`
  (energy still 0). Heuristic unchanged (risk term ≥ 0, not estimated ->
  still admissible). Routes report `riskAvg` (length-weighted), passed
  through the worker protocol.
- Bremen Hbf -> Vegesack (45 km/h): b=0 19.9 km / 44.4 min / risk 100;
  b=0.5 19.6 km / 44.6 min / 97; b=2 20.1 km / 49.3 min / 70. A* == Dijkstra
  for every b.
- Tests: tsc clean; vitest 90 passed (synthetic fast-risky vs calm-detour
  switch, cost arithmetic, optimality).
- Commit: 8b04983
- Next: sliders in the UI.

### 2026-10-07 — Iteration 26 (weight sliders) — step 5 complete
- What: config `WEIGHT_TIME_RANGE` (0.2–2, default 1), `WEIGHT_RISK_RANGE`
  (0–3, default 0.5), risk classes (≤60 low, ≤90 medium, else high),
  `REROUTE_DEBOUNCE_MS` 150. `ui/weights.ts` (pure clamp/persist/classify),
  `ui/weightsPanel.ts` ("Routenwahl" <details> with two sliders, locale-
  formatted values, hint text), app passes weights to the router, reroutes
  debounced, summary adds "· geringes/mittleres/hohes Risiko". i18n de/en.
- Browser check (Bremen, 25 km/h profile, Hbf -> Vegesack): b=0.5
  "24,6 km · 78 min · mittleres Risiko"; dragging b to 3 rerouted to
  "24,9 km · 80 min". Values persisted across reload; fixed "0.50" ->
  "0,50" formatting found during the check.
- Tests: tsc clean; vitest 93 passed.
- Commit: 1d12d8d
- Next: push + PR #5; then step 6.

### 2026-10-07 — Iteration 26b (PR #5 + step 6 decisions)
- Opened https://github.com/CodeRenner/MopedMaps/pull/5 (base `ui/map-frontend`).
- User decided: elevation = Copernicus GLO-30 (AWS open data), raster lib =
  tifffile + numpy. Recorded in DECISIONS.md; branch `energy/elevation`;
  step 6 backlog added. Download of the 4 Bremen-area tiles approved.

### 2026-10-07 — Iteration 27 (DEM reader)
- Downloaded 4 GLO-30 tiles (N52/N53 × E008/E009, 25–33 MB each, 120 MB)
  to `data/dem/` (gitignored). tifffile 2026.9 + numpy 2.5 (BSD) added.
- What: `dem.py` — `DemTile` reads GeoTIFF tags (pixel scale, tiepoint,
  pixel-is-point), decodes deflate tiles and undoes TIFF predictor 3 in
  numpy (`undo_float_predictor`; avoids the heavy `imagecodecs` dep),
  bilinear `sample` with edge clamping; `Dem` lazily loads 1° tiles by
  Copernicus file name, NaN outside coverage. Attribution string included.
- Finding: GLO-30 is a *surface* model — Bremen Marktplatz 11.7 m, but a
  point near Hbf reads 25.4 m (buildings). Edge gradients need smoothing.
- Tests: ruff clean; pytest 66 passed (predictor round-trip vs reference
  encoder, synthetic GeoTIFF bilinear/clamp/NaN, real-tile plausibility).
- Commit: d844275
- Next: ascent/descent per edge.

### 2026-10-07 — Iteration 28 (ascent/descent)
- What: `elevation.py` — DEM sampled at junction nodes, Laplacian smoothing
  over the graph (10×, α 0.5; constants in config), per-edge ascent/descent
  from smoothed end heights; `Edge` gained `ascent_m`/`descent_m`; chunks
  write them to bytes 22–25 (dm); CLI `--dem DIR`, manifest reports
  `elevation_s` and `edges_without_elevation`.
- Calibration (Bremen, documented in docs/elevation.md): first tried a 30 m
  profile + median + hysteresis (9.3 m/km — noise lives *between* edges),
  pixel-minimum (negative heights at the Weser), then node smoothing:
  1.94 m/km, heights 0–42 m, grade p99 1.6 %, max 3.3 %. 0.8 s for Bremen.
- Rebuilt Bremen tiles with `--dem data/dem` (gzip 1.45 MB), regenerated web
  fixtures (built without DEM -> zeros).
- Tests: pytest 69 passed (smoothing keeps trend / removes noise, direction,
  encoding, missing DEM); vitest 93 passed.
- Commit: 255c6ab
- Next: energy model.

### 2026-10-07 — Iteration 29 (energy model)
- What: `router/energy.ts` — per-edge wheel energy = lift + max(0, losses −
  descent release) + stop-and-go at signals; electric: efficiency 0.8, regen
  30 % (braking + surplus descent); combustion: 12 % efficiency, petrol
  8900 Wh/l, idle 0.25 l/h at signals. `edgeCost` adds c·wheelWh (1 s/Wh).
  Routes report `energyWh`, `fuelL`, `ascentM` through the worker protocol.
  Constants in config, model in `docs/energy-model.md`.
- Bug caught by tests: first version let a hump's descent cancel its climb
  on the same edge; now descent only offsets rolling/aero losses.
- Sanity: flat 45 km/h -> ~26 Wh/km electric, ~1.9 l/100 km combustion.
- Tests: tsc clean; vitest 100 passed (incl. A* == Dijkstra with c > 0).
- Commit: 98f7076
- Next: energy UI.

### 2026-10-07 — Iteration 30 (energy UI) — step 6 complete
- What: `WEIGHT_ENERGY_RANGE` (0–3, default 0) + third slider "Gewicht
  Energie"; `energySummary` (pure, tested) -> summary "↑ 53 m · 0,16 l" or
  "↑ 50 m · 345 Wh" / kWh ≥ 1000 Wh; elevation attribution (Copernicus
  GLO-30) in the map footer; i18n de/en.
- Browser check (Bremen tiles built with --dem):
  - Centre -> Osterholz, 25 km/h combustion: "13,4 km · 42 min · mittleres
    Risiko · ↑ 53 m · 0,16 l" (1.2 l/100 km).
  - Same, 45 km/h electric: "13,0 km · 31 min · … · ↑ 50 m · 345 Wh"
    (26.5 Wh/km, matches model).
  - Taps in Lower Saxony (no local graph) gave correct "Ziel liegt zu weit…"
    / "Keine erlaubte Route…" messages; the latter came from snapping to an
    isolated border fragment -> improvement noted.
- Tests: tsc clean; vitest 103 passed.
- Commit: b7d89b9
- Next: push + PR #6, then step 7.

### 2026-10-07 — Iteration 30b (PR #6)
- Opened https://github.com/CodeRenner/MopedMaps/pull/6 (base `safety/risk-score`).
  Branch `pwa/offline` for step 7; backlog added.

### 2026-10-07 — Iteration 31 (manifest + icons)
- What: `web/scripts/make_icons.py` renders own icon artwork (blue tile,
  white route, green/red dots) with numpy + zlib PNG writer, 4x
  supersampling -> 180 (apple-touch), 192, 512, 512 maskable (safe zone);
  `icon.svg` favicon. `public/manifest.webmanifest` (de, standalone,
  start_url/scope "./", theme #2b6cb0). index.html: manifest, icons, iOS
  web-app meta tags, description.
- Browser: manifest + all 4 icons served (200, correct types).
- Hiccup: a ruff failure aborted the `&&` chain before icon.svg was
  written; caught by the new manifest test.
- Tests: vitest 106 passed (manifest fields, icon files exist with declared
  PNG sizes, index.html links).
- Commit: 25306c7
- Next: service worker.

### 2026-10-07 — Iteration 32 (service worker)
- What: `src/sw/policy.ts` (pure strategy per URL + FNV-1a cache version
  hash), `src/sw/sw.ts` (install precache, activate cleans old shells,
  fetch: precache / network-first graph manifest / stale-while-revalidate
  for OpenFreeMap styles+sprites+fonts / passthrough for graph chunks and
  basemap tiles). `vite.config.ts`: sw as separate entry emitted as
  `sw.js` (self-contained, 1 KB gzip); plugin prepends
  `self.__PRECACHE_MANIFEST__=[...]` (hashed assets + public files).
  Registered in production builds only. `web-preview` launch config.
- Bugs found and fixed while testing:
  1. placeholder array got constant-folded by the minifier -> switched to a
     prepended global;
  2. cache version was derived from list length -> FNV hash (test added);
  3. offline, JS/CSS failed: host sends `Vary: Origin` and `crossorigin`
     module requests carry Origin -> `ignoreVary: true` on all matches.
- Verified with `vite preview` + stopping the server: app starts from the
  SW cache, area loads from IndexedDB + cached graph manifest, route
  computed ("12,5 km · 29 min · hohes Risiko · ↑ 49 m · 0,32 l").
- Tests: vitest 111 passed (strategy table, cache-version hash).
- Commit: e240655
- Next: fallback style for first-visit-offline, persistent storage.

### 2026-10-07 — Iteration 33 (fallback style + persistence)
- What: `ui/basemap.ts` — `fallbackStyle()` (style v8, background only, no
  sources/glyphs/sprite; validated with the official style-spec validator in
  tests) and `requestPersistence()` (never throws; handles unsupported /
  already persisted / denied). main.ts switches to the fallback on a
  map error before the style loaded, or after `BASEMAP_TIMEOUT_MS` (8 s),
  and shows a localized note. app.ts requests persistence after the first
  area load.
- Browser check: style URL temporarily pointed at an unreachable host ->
  fallback within ~1 s, note shown, area circle + route + summary work,
  OSM/GeoNames/Copernicus attribution still visible. Config reverted.
- Tests: tsc clean; vitest 113 passed; build OK.
- Commit: 04ee773
- Next: offline docs, then PR #7.

### 2026-10-07 — Iteration 34 (offline docs) — step 7 complete
- What: `docs/offline.md` — install steps (iOS/Android), what is stored
  where and works offline, update/versioning behaviour, known limitations
  (iOS eviction, no background GPS, no full offline basemap yet, radius,
  first start online).
- Commit: 6ef7d55
- Next: push + PR #7; then step 8.

### 2026-10-07 — Iteration 34b (PR #7)
- Opened https://github.com/CodeRenner/MopedMaps/pull/7 (base `energy/elevation`).
  Branch `docs/release` for step 8; backlog added.

### 2026-10-07 — Iteration 35 (licence + README)
- What: `LICENSE` (MIT, "MopedMaps contributors" — user may want a personal
  name instead), `README.md` (EN: features, architecture, dev setup, local
  test graph, limitations, licences), `DATA_SOURCES.md` (OSM/ODbL incl.
  derived-database note for graph tiles, GeoNames CC BY 4.0, Copernicus
  full notice, OpenFreeMap; dependency licences).
- Tests: docs only.
- Commit: d91bbe4
- Next: CI workflow.

### 2026-10-07 — Iteration 36 (CI)
- What: `.github/workflows/ci.yml` — on pull_request (all bases, so stacked
  PRs are checked) and push to main; job `pipeline` (Python 3.12, pip cache,
  `pip install -e .[dev]`, ruff check + format --check, pytest) and job `web`
  (Node 22, npm cache, `npm ci`, typecheck, vitest, build). Read-only
  permissions, concurrency cancels superseded runs.
- Verified like CI would run: pipeline in a fresh venv from pyproject deps
  (69 passed); web from a clean `git archive` export -> found a real CI
  failure: `describe.skipIf` still runs the describe body at collection, so
  `readdirSync(data/tiles-bremen)` threw ENOENT in astar/risk-routing tests.
  Guarded the reads; clean export now 107 passed / 6 skipped.
- Commit: 65afe1e
- Next: band-wise Germany build.

### 2026-10-07 — Iteration 36b (questions + Germany build decision)
- Listed what the user needs to provide (Cloudflare account/token/account ID
  as GitHub secrets, project name, licence holder, PR merges) -> blockers
  section; none blocks current work.
- Asked before the larger pipeline change: user chose the two-pass streaming
  pipeline (recorded in DECISIONS.md); backlog broken down.

### 2026-10-07 — Iteration 37 (streaming pass 1)
- What: `streaming.py` — `routable_tags(way)` (shared filter) and
  `junction_ids(path)`: ways-only pass with pyosmium FileProcessor +
  KeyFilter, refs in `array('q')`, `np.unique` counts -> sorted junction ids.
  Design + estimates in `docs/germany-build.md`.
- Result: identical junction set to the in-memory build on both fixtures and
  on Bremen (51,387 nodes), 1.25 s for Bremen (~5 min extrapolated for DE).
- Tests: ruff clean; pytest 3 new passed (incl. Bremen when present).
- Commit: 2d2ce44
- Next: pass 2 (edges into per-tile temp files).

### 2026-10-07 — Iteration 38 (streaming pass 2)
- Refactor: `graph.split_way(...)` (edge splitting + attributes) now shared
  by `build_graph` and the streaming build — no duplicated logic; all
  existing tests still pass.
- What: `streaming.TileSpool` (buffered pickle spools per tile/kind, one
  open file at a time) and `stream_edges(path, junctions, spool,
  location_store)`: FileProcessor with locations + KeyFilter("highway"),
  traffic-signal nodes collected on the fly, ways split via
  `np.searchsorted` junction lookup, edges spooled by from-tile, endpoint
  nodes spooled by their own tile.
- Result: identical edges to the in-memory build on both fixtures and on
  Bremen (59,515 edges). Bremen with `sparse_file_array` on disk: pass1
  1.2 s + pass2 2.2 s, peak RSS 162 MB (in-memory build 245 MB), spool
  14 MB, node index 32 MB.
- Finding: the location index stores *all* nodes of the extract -> for DE
  ~7 GB; with PBF + spool that exceeds a runner's disk. Added pass 0
  (pre-filter) to the backlog.
- Tests: ruff clean; pytest 76 passed.
- Commit: 0ae00c7
- Next: pass 0 pre-filter.

### 2026-10-07 — Iteration 39 (streaming pass 0)
- What: `streaming.prefilter(src, dst)` — FileProcessor + KeyFilter, writes
  routable ways (same `routable_tags` rule) and traffic-signal nodes through
  `osmium.BackReferenceWriter`, which appends the referenced nodes.
- Result Bremen: 21.2 MB -> 2.5 MB (12 %), index 32 -> 16 MB, 2.5 s; edges
  identical after filtering (fixtures + Bremen). Doc updated with DE disk
  estimate (fits a runner).
- Tests: ruff clean; pytest streaming 11 passed.
- Commit: d99c9b7
- Next: assembly of .mmg tiles from spools.

### 2026-10-07 — Iteration 40 (streaming assembly)
- Refactor: `chunks.encode_tile(key, size, nodes, edges, locate)` extracted
  from `split_into_chunks` (which now uses it); web fixtures regenerate
  byte-identically.
- What: `streaming.assemble(spool)` yields `TileInfo` per tile: junction ids
  per tile sorted (local indices = rank), to-node index via the to-tile's
  sorted ids (lazy LRU `_NodeIndex`, 64 tiles), node->tile from the edge
  geometry endpoints (no global map), then `encode_tile`.
- Result: tiles byte-identical to the in-memory build on both fixtures and
  on all 5 Bremen tiles.
- Tests: ruff clean; pytest 82 passed.
- Commit: 83a7b18
- Next: elevation in streaming mode, then a `build --streaming` CLI.

### 2026-10-07 — Iteration 41 (streaming elevation)
- What: `elevation.smooth_heights(z, fr, to)` — Jacobi Laplacian smoothing
  with `np.bincount` (NaN-aware), O(nodes+edges) memory; `edge_climbs`;
  `apply_elevation` now uses the same array code (Bremen still 1.94 m/km,
  0.6 s). Removed the old dict-based smoother (its only user was a test).
  `streaming.stream_heights(spool, dem)` builds global junction arrays from
  the node spools (`np.unique`, no Python dict) + edge index pairs, smooths
  globally — no tile halos needed; `assemble(..., heights=...)` fills
  ascent/descent per tile.
- Result: streaming tiles *with DEM* byte-identical to the in-memory build on
  the fixture (synthetic ramp) and on Bremen with GLO-30.
- Tests: ruff clean; pytest 85 passed.
- Commit: f067189
- Next: CLI wiring for the streaming build.

### 2026-10-07 — Iteration 42 (streaming CLI)
- What: `cli.write_tiles` (tiles + manifest, shared by both modes),
  `_Clock` for per-phase timings, `build_streaming` (TemporaryDirectory in
  `--workdir`: prefilter -> junctions -> edges with on-disk index ->
  heights -> assemble), flags `--streaming --workdir`. Manifest reports
  `skipped_incomplete_ways`, `nodes_without_elevation`.
- Bremen via CLI with DEM: prefilter 2.6 s, junctions 0.7 s, edges 1.5 s,
  elevation 0.5 s; all 5 tiles byte-identical to the in-memory build. Peak
  RSS 572 MB, mostly 4 decoded DEM tiles (~35 MB each) -> country-scale DEM
  handling added to backlog.
- User confirmed Cloudflare secrets; `gh secret list` shows both names.
- Tests: ruff clean; pytest 87 passed.
- Commit: d6c1cf6
- Next: DEM tiling for country scale, then a mid-size state measurement.

### 2026-10-07 — Iteration 43 (DEM at scale + memory investigation)
- What: `DemTile.sample_array` (vectorised bilinear, float64) and
  `Dem.sample_many` (groups points by 1° tile, decodes each tile once, does
  not cache). Scalar `elevation` and both builds use the same path (note:
  numpy 2 computed the old scalar path in float32 -> tiny height changes;
  Bremen tiles rebuilt; streaming == in-memory still byte-identical).
  `ElevationSource` protocol is now `sample_many`.
- Memory investigation (Bremen streaming build, peak RSS per phase):
  prefilter 582 MB, everything after adds nothing. A single DEM tile decode
  peaks at ~97 MB. On the tiny fixture the prefilter peaks at 43 MB -> the
  BackReferenceWriter's memory grows with the data (likely libosmium id-set
  bitmaps over the sparse id range). Need a real measurement: user approved
  downloading the full Germany extract (4.4 GB).
- Tests: ruff clean; pytest 88 passed (incl. sample_many == scalar on 200
  random points of the real tiles).
- Commit: 00c6676
- Next: Germany measurement.

### 2026-10-07 — Iteration 44 (Germany measurement)
- Downloaded Geofabrik `germany-latest.osm.pbf` (4.5 GB, user-approved) and
  ran `build --streaming` (no DEM; only Bremen DEM tiles exist locally).
- Result: 844 tiles, 14.2 M junctions, 16.8 M edges, 903 MB raw / 490 MB
  gzip, largest tile 4.87 MB; 103 min total (prefilter 12.3 min, junctions
  4.1, edges 78.0, assemble ~8.8); peak RSS 1.58 GB; workdir cleaned up.
  Pre-filter memory is bounded (1.14 GB) -> BackReferenceWriter stays.
- Sizes ~1.4–1.6× the Bremen-based extrapolation; still well inside
  Cloudflare Pages limits (20k files, 25 MiB/file).
- Bottleneck: edge pass I/O-bound (CPU ~32 %) — on-disk node index + bulky
  pickle spools. Disk on a runner would be ~11–13 GB of 14 -> follow-ups
  added (index in RAM, binary spool, delete source after prefilter).
- Docs: size-measurement.md and germany-build.md updated with the numbers.
- Next: speed/disk improvements, then the graph-build Action.

### 2026-10-07 — Iteration 45 (index in RAM, delete source)
- What: `build --streaming --node-index mem|disk` (default mem = pyosmium
  `flex_mem`; disk = previous `sparse_file_array` in the workdir) and
  `--delete-source` (removes the input after the pre-filter). Test: both
  index modes give identical tiles; source file is deleted.
- Bremen too small to show a speed difference (1.5 s either way); a full
  Germany run with the in-memory index is running in the background.
- Tests: pytest CLI 4 passed. Commit: 2f74d62

### 2026-10-07 — Iteration 46 (binary spool)
- What: `TileSpool` now writes fixed-layout struct rows (`encode_edge` /
  `_decode_edges`, `<qdd` node rows) to `*.bin` instead of pickled lists;
  float64 kept so tiles stay byte-identical (int32 e7 would save more but
  could move points across exact tile borders). `size_bytes()` helper.
- Bremen spool 14 -> 9.4 MB (-33 %; geometry dominates). All streaming tests
  incl. Bremen byte-identity pass; codec round-trip test added.
- Note: the Germany run started before this change uses the old pickle
  spool (module already loaded) -> its numbers isolate the index change.
- Commit: b93348a

### 2026-10-07 — Iteration 46b (Germany with index in RAM + deploy decision)
- Germany re-run with `--node-index mem`: prefilter 16.2 min, junctions
  5.6, edges 23.5 (was 78.0), total 54 min (was 103), peak 1.80 GB; all
  844 tiles byte-identical to the first run. Duplicate output deleted.
- User decided: one Cloudflare Pages project for app + tiles (app deploys
  reuse the last graph build's tiles via a GitHub artifact). DECISIONS.md.

### 2026-10-07 — Iteration 47 (DEM fetch)
- What: `dem.tiles_for_bbox`, `tile_url`, `fetch_tiles(tiles, out, fetch)`
  (urllib, skips present files, treats S3 403/404 as "sea tile", atomic
  `.part` rename); CLI `python -m mopedmaps_pipeline dem-fetch OUT [--bbox S W
  N E]`, default Germany 47..55 N x 5..16 E (88 tiles).
- Checked against S3: N54/E005 (North Sea) -> 404, N53/E008 -> 200; local run
  reports the 4 Bremen-area tiles as present.
- Tests: pytest DEM 7 passed (bbox/URL, fake fetcher with present/sea/new).
- Commit: 31cb84d
- Next: workflows.

### 2026-10-07 — Iteration 48 (workflows)
- What: `.github/workflows/graph-build.yml` (cron 3rd of month 02:00 UTC +
  manual with `region` / `deploy` inputs; frees runner disk, pip cache, DEM
  tiles cached via actions/cache, `dem-fetch`, Geofabrik download, streaming
  build with `--dem --delete-source --verify`, uploads `graph-tiles`
  artifact (90 days), then calls deploy) and `.github/workflows/deploy.yml`
  (push to main on web/**, manual, or workflow_call with `graph-run-id`;
  builds the app, downloads the tiles artifact of the given or latest
  successful graph build (warns and deploys without data if none yet),
  `wrangler@4 pages project create || true` + `pages deploy` to `mopedmaps`).
  `web/public/_headers`: no-cache for sw.js/index.html/graph manifest, 1 day
  for tiles, immutable for hashed assets. README deployment section.
- Validation: actionlint clean (all 3 workflows); `_headers` present in
  dist; vitest 113 passed. Workflows only run once on GitHub (after merge
  to main / manual dispatch) — not executed yet.
- Commit: 76777f3
- Next: push + PR #8 (step 8).

### 2026-10-07 — Iteration 49 (PR #8, loop paused)
- Pushed `docs/release`, opened https://github.com/CodeRenner/MopedMaps/pull/8
  (base `pwa/offline`). All 8 roadmap steps are implemented.
- Autonomous loop stopped here: the remaining work needs the user (merging
  the stacked PRs; the graph-build/deploy workflows can only be dispatched
  from the default branch). Improvement backlog kept for a later loop.

### 2026-10-07 — Iteration 50 (merge + step 9 planning)
- User asked to merge everything. Merged #1 with `--delete-branch`, which made
  GitHub *close* #2 (its base branch vanished) instead of retargeting.
  Recovered: restored `pipeline/graph-chunks` at its old sha via the API,
  reopened #2, retargeted to main; then retargeted and merged #2–#8 one by
  one without deleting branches; finally deleted all 8 merged branches
  (each verified as ancestor of main). Lesson: with stacked PRs, retarget
  the next PR to main *before* deleting the previous base branch.
- main CI after the merge: success. Deploy workflow started automatically
  (push to main touching web/).
- New user requests planned as step 9 (backlog above); branch
  `feature/elevation-profile`.

### 2026-10-07 — Iteration 51 (chunk format v2)
- What: node record 8 -> 10 bytes (`<iih`, height in dm, −32768 unknown),
  `VERSION = 2`; `Graph.heights` filled by `apply_elevation`, streaming
  `assemble` passes heights per tile; Python + TS decoders accept v1 and v2
  (`Chunk.heights`, graph `height: Float64Array` with NaN); manifest v1|v2
  accepted by the web app (tiles from the currently running v1 graph build
  keep working). Frozen `v1_small_*` fixture + new `small_dem_*` fixture
  (synthetic ramp DEM). Spec updated with version history.
- Tests: pytest 93 passed (height round-trip, unknown without DEM, v1
  decode); vitest 116 passed (v1/v2 decode, heights vs Python decoder).
  Streaming == in-memory still byte-identical (incl. heights).
- Local Bremen tiles rebuilt as v2 with DEM.
- Commit: cfce526
- Next: route profile + climb hysteresis.

### Note — Germany graph live (2026-10-07)
GitHub graph-build run 37621466950 (`europe/germany`, deploy=true) succeeded: build + deploy jobs green.
https://mopedmaps.pages.dev now serves 844 tiles (14.2 M nodes, 16.8 M edges, 511 MB gzip, format v1);
spot checks: Bremen `212_35` and Munich `192_45` return 200. v2 tiles (node heights) follow with the
next monthly/manual build after `feature/elevation-profile` is merged; the client reads both.

### Iteration 52 — route profile + climb with hysteresis (2026-10-07)
- What: new `web/src/router/routeProfile.ts` (`RouteProfile` = cumulative distance, node height, per-edge
  speed; `climbWithHysteresis`). `findRoute` returns `profile`; worker passes it through `RouteResult`.
  Summary climb = hysteresis climb over node heights (`CLIMB_HYSTERESIS_M = 3`) when all route nodes have
  heights (v2 tiles), else the old per-edge sum (v1 tiles). Documented in docs/elevation.md.
- Why: per-edge climbs over-count DEM noise; profile is also the data for the upcoming route chart.
- Tests: tsc clean; vitest 124 passed (new test/routeProfile.test.ts: hysteresis cases, profile arrays,
  reverse direction, v1 fallback).
- Commit: 8317a01
- Next: browser check of climb on flat Bremen routes with v2 tiles, then push + PR for `feature/elevation-profile`.

### Iteration 53 — climb calibration on Bremen v2 tiles, PR (2026-10-07)
- What: real route Bremen Hbf -> Vegesack (19.9 km, local v2 tiles via worker service): climb at hysteresis
  0/3/5/10 m = 88/72/63/43 m. Set `CLIMB_HYSTERESIS_M = 5` (GLO-30 is a DSM with metres of noise).
  Local-data e2e test now asserts full node heights, profile distance = route distance, climb < 4 m/km.
- Why: user reported wrong climb values; this is the end-to-end check on real data.
- Not done: no click-through in the browser UI (the summary only formats `ascentM`, which the e2e test covers).
- Tests: tsc clean; vitest 124 passed.
- Commit: 00075f4; branch pushed, PR opened for `feature/elevation-profile`.
- Next: `feature/route-chart`.

### Iteration 54 — route chart data model (2026-10-07)
- What: branch `feature/route-chart` (from `feature/elevation-profile`). New pure module `web/src/chart/model.ts`:
  speed as merged step line, elevation from known node heights downsampled by distance buckets keeping
  min/max (`ROUTE_CHART_MAX_POINTS = 300`), 1/2/5 nice ticks, `valueAt` readout (step/interpolated), SVG path.
- Why: keep chart logic testable without DOM; the view only maps points to pixels.
- Tests: tsc clean; vitest 130 passed (new test/chartModel.test.ts, 6 tests).
- Commit: bf8283f
- Next: SVG view `ui/routeChart.ts` in a collapsible panel with touch/hover readout, de/en strings.

### Iteration 55 — route chart view (2026-10-07)
- What: `web/src/chart/layout.ts` (pure: fixed 320×150 viewBox, x axis = exact route length with round km ticks,
  speed axis from 0 on the left, elevation axis on the right, area + line paths, x -> distance) and
  `web/src/ui/routeChart.ts` (collapsible `<details>` panel under the area panel, hidden without a route,
  pointer readout "km · km/h · m", legend; "no elevation data" note for v1 tiles). de/en strings, CSS.
  Fix: `.panel[hidden]` must hide (`.panel {display:grid}` overrode the attribute).
- Browser check (local Bremen v2 tiles, Bremen centre -> Vegesack, 21.6 km, ↑ 62 m): chart renders speed steps
  25/30/45 km/h and elevation 5–30 m, hover readout works, no console errors. First version ran the x axis
  to 30 km; now ends at the route end.
- Tests: tsc clean; vitest 135 passed (new test/chartLayout.test.ts, 5 tests); vite build ok.
- Commit: 36da6db; branch pushed, PR opened (stacked on `feature/elevation-profile` / PR #11).
- Next: `feature/range`.

### Iteration 56 — range model (2026-10-07)
- What: branch `feature/range` (from `feature/route-chart`). `web/src/router/range.ts`: `EnergySettings`
  (capacity Wh|l, real consumption Wh/km|l/100 km, reserve share), `referenceConsumption` (model on a flat
  1 km edge at min(40, vmax) km/h), `calibrationFactor` (real/reference, clamped 0.3–3), `estimateRange`
  (calibrated use, per-km consumption, share used, remaining km, reserve warning; assumes full at start).
  Storage `loadEnergySettings`/`saveEnergySettings` (key `mopedmaps.energy.v1`), `parsePositive`.
  Config: `RANGE_REFERENCE_SPEED_KMH`, `RANGE_CALIBRATION_MIN/MAX`, `RANGE_RESERVE_SHARE`. Docs: energy-model.md "Range".
- Why: user wants range with their real battery consumption; separate settings keep the routing profile unchanged.
- Reference values: electric 12.2 Wh/km (25 km/h) / 21.6 Wh/km (45); petrol 0.91 / 1.62 l/100 km.
- Tests: tsc clean; vitest 143 passed (new test/range.test.ts, 8 tests).
- Commit: bbf169f
- Next: profile panel inputs (capacity, real consumption), then summary display + PR.

### Iteration 57 — capacity / real consumption inputs (2026-10-07)
- What: vehicle panel gets "Nutzbare Akkukapazität (Wh)" / "Tankinhalt (l)" and "Echter Verbrauch (Wh/km | l/100 km,
  optional)" with a hint; labels follow the drive type. Energy settings are stored per drive
  (`mopedmaps.energy.v1.<drive>`) so Wh and litres never mix. Empty/invalid input clears the value. de/en strings.
- Browser check: entered 1500 Wh / "32,5" Wh/km -> stored as 1500 / 32.5; switching to combustion shows litre
  labels with empty values. Fixed: new inputs were unstyled (13 px, iOS zooms on focus) -> same style as vmax (16 px).
  Test values removed from the browser storage afterwards.
- Tests: tsc clean; vitest 143 passed (storage test now per drive).
- Commit: 637ed5b
- Next: show range in the route summary, then push + PR.

### Iteration 58 — range in the route summary, PR (2026-10-07)
- What: summary energy is now calibrated (`estimateRange`); with a capacity it adds "32 % Akku · Rest ca. 45 km";
  below the reserve (15 %) a red warning; trips needing more than a full battery/tank show "107 % Akku · Reicht nicht
  ohne Laden/Tanken" instead of "0 km left". Pure `rangeSummary` in ui/messages.ts, de/en strings.
- Browser check (Bremen centre -> Vegesack, 21.6 km, electric 45 km/h, real 32 Wh/km): model 434 Wh -> calibrated
  645 Wh; capacity 2000 Wh -> "32 % Akku · Rest ca. 45 km"; capacity 600 Wh -> warning in red (before the "short" text
  fix). Test values removed from browser storage.
- Tests: tsc clean; vitest 144 passed; vite build ok.
- Commit: e9ea138; branch pushed, PR opened (stacked on `feature/route-chart` / PR #12).
- Next: user review/merge of #11 -> #12 -> range PR; then Graph build for v2 tiles.

### Note — step 9 merged (2026-10-07)
PRs #11 (elevation profile), #12 (route chart), #13 (range) merged into main in that order (each retargeted to main
before its base was merged; branches deleted afterwards). CI green; Deploy run 37655082851 succeeded, live bundle
contains the chart and range strings. Live tiles are still format v1 until the next "Graph build" run.

### Note — Safari SW fix + Germany v2 tiles live (2026-10-07)
- iPhone Safari: "Response served by service worker has redirections". Cause: Cloudflare Pages 308 /index.html -> /,
  `cache.addAll` cached the redirected shell. Fix PR #14 (merged): `withoutRedirect()` on precache and on serving.
- Graph build run 37658972444 (europe/germany, v2 with node heights) succeeded: 844 tiles, 534 MB gzip.
- Lesson: the graph build's deploy job builds the app from the commit the build was dispatched on, so it
  overwrote the fix; re-ran Deploy on main (b63bd68) afterwards. Live now: v2 tiles + SW fix.
  Improvement idea: let graph-build deploy check out `main` instead of the dispatch commit.

### Iteration 59 — routing tuning on real Freiburg routes (2026-10-08)
- What: branch `tuning/risk-speed`. Router: vehicle-dependent risk (`runtimeRiskPerKm`: speed differential to vmax
  by road class, urban <= 50 only x0.3; Bundesstraße surcharge trunk +50 / primary +40 above 30 km/h; class points
  removed on 30 km/h main roads; signal risk refunded), signal wait 5 s per node, junction penalty by class
  (0.5 s main roads, 2 s side streets). Pipeline: access lists like `agricultural;forestry` now deny (needs rebuild).
- Why: user report — B3 at 30 km/h avoided, 60 km/h B3/B31 (Guildfordallee) kept until max safety, then the
  whole route flips. Analysis (scratch scripts, OSM street names): risk slider had no effect up to b = 1.5,
  signals counted per node (several per junction), every junction cost the same with or without right of way.
- Calibration against the rider's routes: Tennenbacher/Stefan-Meier -> Tiengener/Basler Landstr. now takes
  Eschholz -> Markgrafen -> Uffhauser from b = 1 (before only at 3); -> Elsässer/Wirthstr. stays on Neunlinden-/
  Hartmannstraße up to b = 1. Overland (Emmendingen, Waldkirch, Bad Krozingen) checked; found farm tracks used.
- Open: OSM has Habsburgerstraße (B3) mostly as 50 km/h (rider says 30); track policy (see below).
- Tests: vitest 147 passed, tsc clean, build ok; pytest 93 passed, ruff clean.
- Next: user decision on tracks; PR; graph build for the access fix.

### Note — tuning live, tracks closed (2026-10-08)
PR #15 merged (tuning + access lists + tracks only when signposted open, user decision). Graph build
37762634018 succeeded and deployed (tiles v2 built 2026-10-08 10:52). Verified with live tiles: Tennenbacher ->
Emmendingen KKH and Hbf -> Waldkirch use 0 m of tracks (before: several km from b = 0.5); R1 takes the rider's
route (Eschholz -> Markgrafen -> Uffhauser) at b = 1.

### Iteration 60 — route controls and fast-section colours (2026-10-08)
- What: branch `feature/route-controls`. ⇄ (reverse) and ✕ (cancel) buttons at the bottom centre, kept above the
  map attribution (ResizeObserver; the attribution wraps to 4 lines on phones). Taps no longer reset an existing
  route (user: zooming to inspect the route cancelled it). Route sections > 50 km/h orange, > 70 km/h red
  (`ROUTE_BAND_*` in config), sections < 100 m dropped (unmapped links default to 100 and flashed red).
- Browser check: Bremen (reverse swaps markers, route recomputed 19.9 -> 20.5 km; stray tap keeps the route);
  Freiburg -> Emmendingen with local Germany tiles: red section at Denzlingen, orange at Gundelfingen; phone
  viewport: buttons 10 px above the attribution; ✕ clears markers, chart and buttons.
- Tests: vitest 151 passed, tsc clean, build ok.
- Next: user review/merge; traffic-volume data research (user question).

### Iteration 61 — reopen last area (2026-10-08)
- What: branch `feature/remember-area`. `ui/areaStore.ts` stores PLZ + radius after a successful load; on start
  the panel is prefilled and the area loads automatically (chunks from IndexedDB). Profile/weights/energy were
  already persisted.
- Browser check: load 28195 / 30 km, reload -> area back after ~1 s, panel collapsed, ready for taps.
- Tests: vitest 152 passed, tsc clean.
- Next: navigation mode (location, follow, slim UI).

### Iteration 62 — navigation mode (2026-10-08)
- What: branch `feature/navigation` (stacked on `feature/remember-area`). Pure core `web/src/nav/progress.ts`
  (projection onto the route, remaining distance/time share, arrival, off-route detector) and `maneuvers.ts`
  (turns at junctions from geometry); `nav/navigation.ts` (watchPosition, follow camera jump-or-glide, heading,
  wake lock, reroute, slim overlay); controls ◎ (my location as start) and ▶ (start navigation);
  `ui/aboveAttribution.ts` keeps bottom elements above the attribution. Docs: docs/navigation.md.
- Browser check with a simulated GPS track (Bremen Hbf -> Vegesack): slim UI, "In 80 m rechts abbiegen",
  limit badge 50, remaining km/min/ETA, follow at zoom 16.5; a 150 m detour triggers "Neue Route …" after 3 fixes
  and new instructions; ✕ restores the normal UI. Fixed during the check: camera lagged behind (jump when far,
  glide 600 ms otherwise); bottom bar covered the attribution.
- Not verified in the browser: arrival display (covered by unit test); real device GPS/wake lock (needs the user).
- Tests: vitest 159 passed, tsc clean, build ok.
- Next: user test on the phone; traffic data (report docs/research-traffic-data.md).

### Iteration 63 — traffic volume (DTV) from BW counting stations (2026-10-08)
- What: branch `feature/traffic-volume`. Pipeline `traffic.py` (CSV reader, ref normalisation incl. "B 3;B 31",
  nearest same-ref station within 8 km), `Edge.dtv`, stored in the reserved uint16 of the edge record (DTV/10;
  format stays v2, old tiles read 0 = unknown), `--traffic` CLI option, graph build resolves the CSV via the
  MobiData BW CKAN API (optional step). Router: `dtvRiskPerKm` (0 / +20 / +45 at 2k / 8k / 20k vehicles/day,
  half in town, none on 30 km/h roads). Attribution + DATA_SOURCES.md; research report committed.
- Why: user decision after the data research (busy L/K roads look harmless by OSM class alone).
- Tests: pytest 97 passed (new test_traffic.py), ruff clean; vitest 162 passed (new traffic fixture decoded
  cross-language, DTV risk + routing test); actionlint ok.
- Not yet verified: matching rate on real BW data (needs the next graph build).
- Next: daily roadworks/closures file (GitHub Action) + router blocking; then graph build and Freiburg check.
### Iteration 64 — daily road closures (2026-10-08)
- What: branch `feature/closures`. Pipeline `closures.py` (stdlib): MobiData BW ROAD_CLOSED lines -> `closed`,
  Freiburg "Vollsperrung" polygons -> `avoid`; Deploy workflow writes `dist/closures.json` on every deploy and
  daily (cron 02:30 UTC). App: worker matches closures to edges (`router/closures.ts`), A* skips closed
  directions and adds 600 s for avoid areas; map layer; attribution; SW network-first; docs/closures.md.
- Real data (2026-10-08): 343 BW closures + 9 Freiburg full closures (386 KB). Freiburg area: 3 BW lines and
  8 Freiburg polygons matched. R1 at b = 1 avoids the full closure "Haslacher Straße Kreuzung Markgrafenstraße"
  (falls back to the B3 corridor). Browser: closures drawn, attribution shown.
- Tests: pytest (new test_closures.py), vitest 166 passed (closures matching/routing, SW policy), actionlint ok.
- Next: user review/merge (#19 traffic volume, closures PR); graph build for DTV.

### Iteration 65 — personal safety preferences (2026-10-08)
- What: branch `feature/risk-prefs`. `CostWeights.prefs` (fast, traffic, junctions, surface, lighting; 0.5/1/2);
  `runtimeRiskPerKm` scales the speed/Bundesstraße, DTV and static junction/surface/lighting parts; junction factor
  also scales signal/junction waits in the cost. UI "Sicherheit im Detail" with −/0/+ per factor, stored with the
  weights; reported risk stays neutral. Docs: risk-model.md.
- Also: PR #21 auto-update (user's phone kept the old app after deploy).
- Tests: vitest (prefs storage, each factor, routing flip with "+ fast roads"), tsc clean.
- Next: merge; check graph build (DTV) in Freiburg.

### Iteration 66 — default safety 1.5, residential real speed (2026-10-08)
- Default safety weight 1.5 for new installs (PR #23, user request).
- User report: Kandel Döner (Rennweg 23a) -> KKH Emmendingen at time 1 / safety 1.5 uses Zähringer Straße (B3),
  the way back a rat-run (Berggasse, Wildtalstraße, Rötebuckweg, Sonnhalde, Rotackerstraße, Händelstraße).
  Analysis with live tiles + closures: not a closure; reversing the outbound path hits one-ways at
  Gundelfinger/Zähringer Str.; forced return via Zähringer Straße costs only 1.4 % more (36.2 vs 35.5 min).
  Fix: residential speed factor 0.8 (`CLASS_SPEED_FACTOR`). Suite (live tiles): K both directions via Zähringer
  Straße from b = 1; R1 unchanged; R2 now stays on main roads up to b = 1.5.
- Tests: vitest 173 passed (test helpers use a neutral class; residential factor asserted).

### Iteration 67 — real turn costs (2026-10-08)
- User report: "+ Kreuzungen & Abbiegen" made routes leave main roads for side streets with *more* turns. Cause:
  the setting scaled junction density (main roads with many side streets have many short edges) — backwards;
  turns were not modelled at all (node-based A*).
- Fix: edge-based A* (state = arc) with turn costs (`router/turns.ts`): straight/slight bends, bends without
  alternatives and following a bending main road are free; right/left turns cost by sharpness, left adds risk.
  The "Abbiegen" setting scales only these. Headings per arc computed at graph assembly.
- Live tiles, safety 1.5: turns KKH->Rennweg 16 -> 14 with "+", Hbf->Waldkirch 14 -> 12; calibration routes
  unchanged. Performance: ~45 ms instead of ~25 ms per route in the Freiburg area.
- Tests: vitest 178 passed (new turns.test.ts: angles, crossing, abknickende Vorfahrt, bend, zig-zag vs main road).

### Note — traffic volume live (2026-10-08)
Graph build 37789231077 succeeded: 5,628 BW counting stations read; 11.45 M edges (before 16.8 M — farm tracks now
excluded), 335 MB gzip. Its deploy job shipped the app of the dispatch commit again, so Deploy was re-run on main
(70f5c57). DTV coverage Freiburg–Emmendingen by length: primary 72 %, trunk 62 %, secondary 65 %, tertiary 51 %,
unclassified 0 % (as expected). Calibration suite on the new tiles unchanged (R1, R2, Kandel <-> KKH).
Follow-up idea: let the graph build's deploy check out `main` to avoid shipping an old app.

### Iteration 68 — recent destinations and favourites (2026-10-08)
- What: branch `feature/places`. `ui/placesStore.ts` (recent destinations, newest first, deduplicated within 75 m,
  max 8; home/work), panel "Ziele" (⌂ Zuhause, ⚒ Arbeit, recent list; ＋ saves the current destination, ✕ removes).
  Tapping a destination routes from the current start or, without one, from the GPS position; a destination chosen
  first is kept when the start is tapped. Labels: nearest real place from the PLZ table (`PlzIndex.nearest`,
  ~1,450 company/authority postal codes like "Deutsche Post AG …" skipped; Freiamt/Landesbergen kept).
- Browser (Bremen): route -> recent "27809 Lemwerder", saved as home, cancel, tap Zuhause -> route from location.
- Tests: vitest 183 passed.

### Iteration 69 — voice guidance (2026-10-08)
- What: branch `feature/voice` (stacked on `feature/places`). `nav/voice.ts` (pure announcer: early + "now" per turn,
  arrival, reroute; speed-dependent distances), `nav/speech.ts` (speechSynthesis, de-DE/en-GB, on/off stored),
  🔊/🔇 button in the navigation bar, first announcement inside the ▶ tap (iOS gesture rule).
- Browser with simulated GPS (speech recorded): "Navigation gestartet.", "In 150 Metern links abbiegen.",
  "In 300 Metern rechts abbiegen.", "Jetzt rechts abbiegen."; muted -> no speech, setting stored.
- Not verifiable here: real voice output on iOS (needs the device).
- Tests: vitest 189 passed (new voice.test.ts).

### Iteration 70 — one-time notice per device (2026-10-08)
- What: branch `feature/welcome`. `ui/welcome.ts`: on first start a dialog with safety ("rules and signs on site
  take precedence, do not operate while riding"), no-warranty note on open data, privacy note, plus device tips
  (iOS: add to home screen, screen on / no background GPS, silent switch; Android: install, screen on / battery
  saver; desktop: for planning). Accepted once per device (`mopedmaps.welcome`, versioned to re-show later).
- Browser (phone viewport): dialog readable, "Verstanden" stores it, not shown again after reload.
- Tests: vitest 192 passed (platform detection incl. iPadOS, items, versioned acceptance).
