# CLAUDE.md

## Project
Offline-first PWA that plans routes for mopeds and small motorcycles.
Vehicle profile is user-configurable (max speed, drive type). The user picks
a location by postal code (PLZ); the app loads the road network within a
75 km radius around it and routes inside that area.
Open source, free, no backend. Routing runs entirely in the browser.
No live data (no traffic), only OSM and elevation data.
Full background: see PROJECT_BRIEF.md.

## Architecture (do not change without asking)
1. `pipeline/` (Python): OSM extract of Germany (Geofabrik) -> routing graph
   split into spatial tiles/chunks (e.g. fixed grid), each a compact file.
   Edges store raw attributes, NOT final travel time (see Edge model).
2. `web/` (PWA): MapLibre GL JS + PMTiles.
   - PLZ -> coordinates via a bundled open PLZ lookup table (e.g. GeoNames
     postal codes, CC BY 4.0, attribution required)
   - app downloads only the graph chunks inside the radius (default 75 km,
     constant in config), stores them in IndexedDB
   - A* in a Web Worker (JS or WASM)
3. Static hosting only (GitHub Pages / Cloudflare Pages / object storage
   for chunks). Check hosting size and file limits before choosing.
4. Graph builds via GitHub Action (monthly)

No server, no API keys, no tracking or analytics services.

## Vehicle profile (user-configurable at runtime)
- `vmax` (km/h): e.g. 25, 45, or higher; free numeric input with presets
- `drive`: `electric` or `combustion`
- Access rules depend on vmax:
  - vmax < 60: exclude motorway and trunk/motorroad=yes (not allowed by law)
  - vmax >= 60: motorways/motorroads may be allowed; make this a documented
    config rule, not hardcoded
  - Cycleways and footways excluded unless explicitly allowed
    (moped=yes; for 25 km/h mofa the usual "Mofa frei" signage)
- Effective edge speed = min(edge speed limit, vmax)
- Unknown maxspeed: assume by road type (urban 50, rural 100), then cap
  at vmax

## Domain rules
- Relevant OSM tags: highway, maxspeed, surface, cycleway, lit, access,
  moped, motor_vehicle, motorroad
- Apply penalties for curves, junctions, traffic lights
- Gradient from Copernicus DEM / SRTM

## Edge model
Store per edge: length, speed limit (raw), road class, surface, lit, gradient,
access flags, risk score. Do NOT bake in travel time or energy: both depend on
the runtime vehicle profile and are computed in the router.
At runtime: `cost = a*time + b*risk + c*energy` with user sliders a, b, c.
- time = f(length, min(speed limit, vmax), penalties)
- energy: electric = Wh/km by speed and gradient; combustion = fuel use
  or refuel-stop planning (simple model first)

## Conventions
- Code, comments, commits and README in English (international users);
  UI texts via i18n files, German first
- Python: type annotations, `ruff`, `pytest`
- Frontend: TypeScript, no heavy framework without good reason
  (small bundle, must run on older iPhones)
- Keep router logic pure and testable (no DOM dependencies in the worker)
- New dependencies only with compatible licences (MIT/Apache/BSD)

## Licence and compliance
- Code licence: still open (MIT or AGPL), do not decide on your own
- UI must show "© OpenStreetMap contributors" (ODbL), the elevation data
  source and the PLZ data source
- Do not use tiles from openstreetmap.org; own PMTiles or a free tier only
- No Apple Developer account: PWA only, no App Store build

## Known limitations (state openly in the docs)
- Routes are limited to the loaded radius around the chosen PLZ
- iOS: no background GPS, screen must stay on during navigation
- iOS may evict web-app storage: the app must be able to reload chunks
- Free-text address search is hard without a server: PLZ + tap-on-map first
- Germany only at the start

## Roadmap (in order, each step with tests)
1. Pipeline: OSM -> tiled graph with raw edge attributes and access rules
2. A* router in the worker with vehicle profile (vmax, drive), tests with
   fixed start/destination pairs
3. PLZ lookup, chunk loading for the 75 km radius, IndexedDB storage
4. Frontend: map, set start/destination, show route, profile settings
5. Safety score and sliders
6. Elevation, energy and range model per drive type
7. PWA: offline cache, installability
8. Docs, licence, GitHub Action for graph builds

## Open decisions (ask the user, do not guess)
- Hosting for the chunk files (size of tiled Germany graph decides)
- Licence: MIT or AGPL
- Whether the radius should be user-adjustable (default 75 km)
- Which vmax presets to offer

## Working style
- Start with roadmap step 1, do not jump ahead
- Ask briefly before larger architecture changes
- Commit small, runnable increments
- Keep assumptions (speed defaults, safety weights, radius) as constants in
  a config file and document them so they are easy to tune
