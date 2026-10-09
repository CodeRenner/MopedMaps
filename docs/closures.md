# Road closures (daily)

User decision 2026-10-08: closures as a **daily static file**, no live requests
from the app (see `docs/DECISIONS.md`).

## Pipeline
`pipeline/src/mopedmaps_pipeline/closures.py` (stdlib only) writes `closures.json`:
- **MobiData BW roadworks** (Bundes-/Landes-/Kreisstraßen in Baden-Württemberg, GeoJSON lines):
  only `type = ROAD_CLOSED` → kind `closed`; `ONE_DIRECTION` → `oneway: true` (closed in the
  direction the line is drawn).
- **Stadt Freiburg** "Verkehrsrelevante Baustellen" (WFS polygons): only entries whose traffic note
  contains "Vollsperrung" → kind `avoid`. The polygon often also covers open cross streets and the
  closed street is only named in free text, so these are a penalty, not a block.
- **Sachsen** SPERRINFOSYS (LISt/LASuV, all road classes incl. municipal roads, daily GeoJSON ZIP in
  ETRS89/UTM33, reprojected in `utm_to_latlon`): only `Sperrung_Art_Klartext = Vollsperrung` → `closed`.
- **Brandenburg** Landesbetrieb Straßenwesen Baustelleninfo (OGC API Features, B/L/K): `Art = Sperrung`
  whose note says "Vollsperrung" → `closed` (plain "Sperrung" also covers lane closures).
- **Berlin** VIZ roadworks: `severity = Vollsperrung` → `closed` (line part of the geometry collection).
  Direction-only closures are skipped: the closed direction is not machine-readable.
- Only closures active now or starting within 7 days; the app filters by its own clock again.

The **Deploy** workflow runs it on every deploy and on a daily schedule (02:17 UTC); the file is
served with `Cache-Control: no-cache` and fetched network-first by the service worker, so the app
uses the last downloaded file offline. If a source fails, the others are still written; if all fail,
the app routes without closures. Size 2026-10-08: 1,303 closures, 958 KB (240 KB gzip).

## App
`web/src/router/closures.ts` (worker): a `closed` line blocks an edge when ≥ 70 % of the edge lies
within 15 m of the line (`CLOSURE_MATCH_*`), in both directions or only the drawn direction. An `avoid`
polygon adds 600 s cost (`CLOSURE_AVOID_PENALTY_S`) to edges with ≥ 60 % inside. The map shows closed
lines red dashed and avoid areas orange.

Example (2026-10-08): Tennenbacher Str. → Tiengener Str. at safety weight 1 normally takes
Eschholz → Haslacher → Markgrafen; with the Freiburg full closure "Haslacher Straße Kreuzung
Markgrafenstraße" it avoids the area.

## Limitations
- Only Baden-Württemberg, Sachsen, Brandenburg and Berlin (plus the city of Freiburg). The other states
  publish roadworks only under unclear licences (Rheinland-Pfalz, Schleswig-Holstein incl. its
  Niedersachsen/MV/Hamburg layers) or behind a Mobilithek subscription; they are left out for licence
  reasons (`docs/research-data-germany.md`). The app says so in "Sicherheit im Detail".
- Construction sites without a full closure (one lane, traffic lights) are ignored.
- Up to one day old (daily file), longer when offline.
