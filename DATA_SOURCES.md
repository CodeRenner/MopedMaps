# Data sources and third-party notices

The MopedMaps **code** is MIT-licensed (see `LICENSE`). The **data** the app
uses or ships comes from third parties under their own licences, which must
be respected when redistributing builds or graph tiles.

| Data | Used for | Licence | Required attribution (shown in the app footer) |
|------|----------|---------|------------------------------------------------|
| OpenStreetMap (Geofabrik extracts) | road graph (`.mmg` chunks) | ODbL 1.0 | "© OpenStreetMap contributors" |
| GeoNames postal codes (`DE.zip`) | `web/public/data/plz.json` | CC BY 4.0 | "PLZ: GeoNames (CC BY 4.0)" |
| Copernicus DEM GLO-30 | ascent/descent per edge | free licence, attribution required | "Copernicus DEM GLO-30 (© DLR e.V., © Airbus DS, ESA/EU)" |
| Straßenverkehrszählung Baden-Württemberg (Verkehrsministerium BW via MobiData BW) | traffic volume (DTV) per edge, risk score | Datenlizenz Deutschland – Namensnennung 2.0 | "Verkehrsmengen: Verkehrsministerium BW (dl-de/by-2-0, bearbeitet)" |
| OpenFreeMap / OpenMapTiles basemap | map background (online) | OSM data ODbL; OpenMapTiles schema | provided by the style ("OpenFreeMap © OpenMapTiles Data from OpenStreetMap") |

Notes:
- The graph chunks are a **derived database** of OpenStreetMap data and are
  therefore published under the ODbL; anyone hosting them must keep the
  attribution and offer the same licence for the derived data.
- The app never uses tile servers of openstreetmap.org (OSMF tile policy).
- Traffic counts: counting stations are matched to OSM roads by road number
  (`ref`) and distance (pipeline `traffic.py`), i.e. the data is modified
  ("bearbeitet"). Source CSV resolved via the MobiData BW CKAN API
  (dataset `karte_strassenverkehrszaehlung`) at build time. Only
  Baden-Württemberg; elsewhere the field is 0 (unknown).
- Copernicus DEM full notice: "produced using Copernicus WorldDEM-30 © DLR
  e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under
  COPERNICUS by the European Union and ESA; all rights reserved".

## Software dependencies
Runtime (bundled into the web app): `maplibre-gl` (BSD-3-Clause) and its
dependencies (MIT, ISC, BSD-2/3-Clause, Apache-2.0).
Pipeline: `osmium` / pyosmium (BSD-2-Clause), `numpy` (BSD-3-Clause),
`tifffile` (BSD-3-Clause).
Development only: TypeScript (Apache-2.0), Vite and Vitest (MIT),
fake-indexeddb (Apache-2.0), ruff and pytest (MIT).
