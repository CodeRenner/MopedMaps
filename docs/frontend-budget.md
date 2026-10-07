# Frontend size budget and compatibility (2026-10-07)

## Bundle (vite build, gzip -9)
| Asset | Raw | gzip |
|-------|-----|------|
| `index-*.js` (app + MapLibre main thread) | 1.07 MB | 287 KB |
| `maplibre-gl-worker-*.mjs` (MapLibre tile worker) | 508 KB | 144 KB |
| `worker-*.js` (our router worker) | 6.9 KB | 3.2 KB |
| `index-*.css` | 85 KB | 11 KB |
| `data/plz.json` | 460 KB | 161 KB |
| **Total first load** (excl. basemap + graph tiles) | | **≈ 606 KB** |

Our own code is small (router worker 3 KB gzip); MapLibre is ~95 % of the JS.
Budget: keep app code (everything except MapLibre) under 100 KB gzip.

Per area (graph tiles, from `docs/size-measurement.md`): ~1.1 MB for 25 km
around Bremen; 10–70 MB gzip for 75 km depending on density.

## Compatibility
- JS target ES2020 (`vite.config.ts`, `tsconfig.json`); no `Array.prototype.at`
  and other ES2022 APIs in our code.
- MapLibre GL JS 6 requires **WebGL 2** → iOS/iPadOS Safari **15+**
  (iPhone 6s and newer can run iOS 15). Older devices cannot show the map.
- Module workers (`new Worker(url, {type: 'module'})`) → Safari 15+.
- IndexedDB optional: falls back to in-memory cache (private mode).

## Startup
UI is created on `style.load` (basemap style ready), not on `load` (all
tiles), which took >10 s on a slow link in the first test.

Known gap: without network the OpenFreeMap style cannot load, so the app does
not start offline yet — addressed in roadmap step 7 (offline cache / own
PMTiles).
