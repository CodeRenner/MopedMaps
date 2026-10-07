# Progress log

Working log for the autonomous build loop. Each iteration reads this file
first, does ONE small runnable increment, then appends an entry below and
updates "Current state". Newest entries at the bottom.

## Current state
- Roadmap step: 1 done (except band-wise Germany build); 2 done (PR #2, branch `router/astar`); 3 done (PR #3, branch `data/plz-chunks`); 4 done (PR #4, branch `ui/map-frontend`); 5 done (PR #5, branch `safety/risk-score`); 6 done (PR #6, branch `energy/elevation`); 7 (PWA offline + installability) — next
- Next task: step 7 — web app manifest + generated icons (installability)
- Branches: `pipeline/graph-chunks` = PR #1 (step 1). `router/astar` = PR #2 (step 2, stacked on #1). `data/plz-chunks` = PR #3 (step 3, stacked on #2). `ui/map-frontend` = PR #4 (step 4, stacked on #3). `safety/risk-score` = PR #5 (step 5, stacked on #4). `energy/elevation` = PR #6 (step 6, stacked on #5). `pwa/offline` (local, stacked on #6) = step 7
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
- [ ] Web app manifest (name, icons, theme, standalone, start_url), apple-touch-icon + iOS meta tags, generated icons (no third-party artwork)
- [ ] Service worker (hand-written, no extra deps): precache app shell (hashed Vite assets via build manifest) + plz.json; network-first for graph manifest
- [ ] Offline start: if the basemap style cannot load, fall back to a minimal local style (background + route/area layers only) so routing still works with cached graph chunks
- [ ] Ask the browser for persistent storage (navigator.storage.persist) after loading an area; show storage note on iOS
- [ ] Offline test in the browser (devtools offline), then PR #7
- Note: no bulk prefetching of OpenFreeMap tiles (respect their usage policy); full offline basemap comes with own PMTiles later

## Later / improvements (found during checks)
- [ ] Snap start/target only to the largest connected component (taps near the data border hit isolated fragments -> "unreachable")
- [ ] Range hint: battery capacity / tank size in the profile, show remaining range
- [ ] Route climb still noisy on flat routes (Bremen centre -> Osterholz: 53 m over 13 km); tune smoothing or add per-route hysteresis
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
