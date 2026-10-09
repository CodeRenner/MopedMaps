# Offline address and place search

No server: the search runs in the browser over data downloaded with the area.

## Pipeline
`python -m mopedmaps_pipeline places SRC.osm.pbf OUT` (`places.py`, one pass with node locations)
writes `OUT/places/<iy>_<ix>.json` on the graph's tile grid plus `places/index.json`:
- **addresses**: `addr:housenumber` + `addr:street` (or `addr:place`) on nodes and buildings
  (building centroid), grouped per street/postcode/city, house numbers sorted, coordinates as
  1e-5° deltas; duplicates (entrance node + building) dropped;
- **streets**: one point per named highway and tile (finds streets without house numbers);
- **places**: named objects with `amenity`, `shop`, `tourism`, `leisure`, `office`, `healthcare`,
  `craft`, `historic`, settlements (`place=city … neighbourhood`) and stations.

Bremen (state): 151k addresses, 6k streets, 14k places → 0.9 MB gzip. Extrapolated: roughly
2–3 MB for a 75 km area around a mid-size city, ~100–150 MB for all of Germany.
The graph build runs it before the tile build (optional step).

## App
`data/places.ts` loads the tiles of the loaded area into their own IndexedDB store (`places`,
pruned separately from the graph chunks) and keeps `index.json` for offline starts.
`search/index.ts` (pure):
- normalises German spellings (`Str.`/`str` → `strasse`, ä→ae, ß→ss, accents removed);
- splits off a house number and a 5-digit postcode; a trailing settlement name
  ("… Emmendingen") moves the reference point there instead of having to match;
- matches word prefixes (and ≥ 4-letter parts inside compound street names);
- places also match German kind words ("Krankenhaus", "Tankstelle", "Apotheke" …);
- ranks by match quality (exact house number first, parking last) and distance to the map
  centre; places show the nearest settlement.
Typical query on Bremen data: 1–5 ms. Picking a result moves the map there and routes to it from
the current start or the GPS position; the label is kept for "Ziele".

## Limits
- Only inside the loaded area; data as complete as OpenStreetMap (house numbers are well
  covered in most German cities, patchier in villages).
- No fuzzy matching of typos yet.
