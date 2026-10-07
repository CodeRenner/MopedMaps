# Bundled data

| File       | Source | Licence | Rebuild |
|------------|--------|---------|---------|
| `plz.json` | GeoNames postal codes `DE.zip` (https://download.geonames.org/export/zip/) | CC BY 4.0 — the UI must show "Postal codes: GeoNames (geonames.org), CC BY 4.0" | `.venv/bin/python -m mopedmaps_pipeline plz data/geonames-DE.zip web/public/data/plz.json` |

`plz.json` format: `{"v":1,"attribution":"…","rows":[["PLZ",lat,lon,"Place"],…]}`,
sorted by PLZ; coordinates are the mean of GeoNames' distinct points for that
PLZ, rounded to 4 decimals. Includes large-customer PLZs.
