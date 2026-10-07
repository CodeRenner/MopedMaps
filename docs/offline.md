# Offline behaviour and installation (roadmap step 7)

## Install
- **iPhone/iPad (Safari):** Share → "Zum Home-Bildschirm". Opens standalone
  (no browser bar), icon from `web/public/icons/`.
- **Android (Chrome):** "App installieren" prompt or menu → "Zum
  Startbildschirm hinzufügen" (manifest + maskable icon).

## What works offline
| Part | Stored where | Offline |
|------|--------------|---------|
| App code, CSS, workers, icons, `index.html` | Service worker precache (`shell-<hash>`) | ✅ after the first online visit |
| PLZ table (`data/plz.json`) | precache | ✅ |
| Graph chunks of loaded areas | IndexedDB (`mopedmaps` / `chunks`, keyed by build) | ✅ for areas loaded before |
| Graph `manifest.json` | SW runtime cache, network-first | ✅ last seen version |
| Basemap style, sprites, fonts | SW runtime cache, stale-while-revalidate | ✅ once seen online |
| Basemap tiles (OpenFreeMap) | browser HTTP cache only | ⚠️ only what the browser still has; no bulk caching (provider policy) |
| Routing, risk, energy | runs in a Web Worker, no network | ✅ |

If the basemap style can't load at all, the app switches to a built-in
background-only style after an error or 8 s (`BASEMAP_TIMEOUT_MS`) and
shows a note. Area circle, markers, route and summary keep working.

## Updates
A new build changes the precache list → new `shell-<hash>` cache; the old one
is deleted on activation. A new graph build changes `built_at` in the graph
manifest → cached chunks of the old build are ignored and pruned after the
next area load.

## Known limitations
- **iOS may evict web storage** (IndexedDB, caches) after a period of
  non-use or under storage pressure. The app asks for persistent storage
  (`navigator.storage.persist()`), but iOS may still clear it; chunks are
  then simply downloaded again.
- **iOS: no background GPS**, the screen must stay on during navigation.
- **No full offline basemap yet**: needs own PMTiles (planned, see
  DECISIONS.md). Without network the map may show only the plain background.
- Routes only within the loaded radius around the chosen PLZ.
- First start must be online (to install the service worker and load data).
