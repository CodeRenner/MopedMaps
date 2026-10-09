# MopedMaps

Offline-first route planner for mopeds, mofas and small motorcycles — a free,
open-source PWA that runs **entirely in the browser**. No backend, no API
keys, no tracking.

Pick your area by German postal code (PLZ). The app downloads the road
network within a 25–100 km radius (default 75 km) and plans routes for your
vehicle: legal access by top speed, travel time, a safety score and an
energy model for electric or combustion drives.

> Status: roadmap steps 1–7 implemented (see `docs/PROGRESS.md`); public
> hosting of Germany-wide graph tiles is being set up. Germany only for now.

## Features
- **Vehicle profile**: top speed (presets 25 / 45 km/h or free input) and
  drive type (electric / combustion).
- **Legal access**: no motorways/motorroads below 60 km/h; cycleways only
  when explicitly opened (`moped=yes`, "Mofa frei" → `mofa=yes`).
- **Routing**: A\* in a Web Worker on a tiled graph; cost =
  `a·time + b·risk + c·energy` with live sliders.
- **Safety score** per road (speed, road class, cycle lanes, lighting,
  surface, junction density) — see `docs/risk-model.md`.
- **Elevation & energy**: Copernicus GLO-30 heights, simple physical model
  (Wh for electric, litres for combustion) — `docs/elevation.md`,
  `docs/energy-model.md`.
- **Offline**: installable PWA, service-worker cache, graph chunks in
  IndexedDB — `docs/offline.md`.
- German UI first, English available.

## Architecture
```
pipeline/   Python: OSM extract -> routing graph -> 0.25° tiles (.mmg) + manifest
web/        TypeScript PWA: MapLibre map, PLZ lookup, chunk loader, A* worker
docs/       design notes, formats, decisions, progress log
```
- Chunk format: `docs/chunk-format.md`
- Edge attributes are raw (length, limits, class, surface, lit, access flags,
  ascent/descent, risk); time and energy are computed at runtime from the
  vehicle profile.

## Development
Requirements: Python ≥ 3.11, Node.js 22.

```bash
python3 -m venv .venv
.venv/bin/pip install -e 'pipeline[dev]'
.venv/bin/pytest pipeline && .venv/bin/ruff check pipeline

cd web && npm ci && npm test && npm run typecheck
npm run dev          # http://localhost:5173
```

Build a local test graph (e.g. Bremen) and serve it to the dev app:
```bash
curl -LO https://download.geofabrik.de/europe/germany/bremen-latest.osm.pbf
.venv/bin/python -m mopedmaps_pipeline build bremen-latest.osm.pbf data/tiles-bremen --verify [--dem data/dem]
ln -sfn ../../data/tiles-bremen web/public/graph
```
PLZ table: `python -m mopedmaps_pipeline plz DE.zip web/public/data/plz.json`
(GeoNames). Elevation tiles: Copernicus GLO-30 from the
`copernicus-dem-30m` open-data bucket into `data/dem/`.

## Deployment
Static hosting on Cloudflare Pages (project `mopedmaps`, app + graph tiles):
- `.github/workflows/graph-build.yml` — monthly (3rd, 02:00 UTC) or manual:
  Geofabrik extract + Copernicus GLO-30 → streaming build (~1 h for Germany)
  → tiles artifact (90 days) → deploy.
- `.github/workflows/deploy.yml` — on pushes to `main` touching `web/`, **daily at
  02:17 UTC** and after each graph build: builds the latest `main`, fetches a fresh
  road-closures file (`closures.json`) and deploys both with the tiles of the
  latest successful graph build (it refuses to deploy without tiles).
- `.github/workflows/keepalive.yml` — weekly: re-enables the scheduled workflows
  via the API, because GitHub disables schedules in public repositories after
  60 days without activity.
- GitHub emails the repository owner when a scheduled run fails.
- Required repository secrets: `CLOUDFLARE_API_TOKEN` (permission
  *Account → Cloudflare Pages → Edit*) and `CLOUDFLARE_ACCOUNT_ID`.

## Known limitations
- Routes only inside the loaded radius around the chosen PLZ.
- iOS: no background GPS (keep the screen on), web storage may be evicted —
  the app re-downloads chunks when needed.
- Address/place search only inside the loaded area (offline index from OpenStreetMap, see docs/search.md); no typo tolerance.
- No live traffic data. Germany only.
- Full offline basemap needs own PMTiles (planned); offline, the map falls
  back to a plain background while routing keeps working.

## Data and licences
Code: MIT (`LICENSE`). Data: OpenStreetMap (ODbL), GeoNames (CC BY 4.0),
Copernicus DEM GLO-30 — details and required attributions in
`DATA_SOURCES.md`.
