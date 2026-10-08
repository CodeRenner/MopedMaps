# Risk model (roadmap step 5)

Implementation: `pipeline/src/mopedmaps_pipeline/risk.py`, constants in
`pipeline/src/mopedmaps_pipeline/config.py` (`RISK_*`). First-guess weights,
meant to be tuned.

## Per-edge score (0–255, stored in the chunk's reserved risk byte)
Static and vehicle-independent: only raw OSM-derived attributes are used.

`score = clamp(0, 255, 50 + speed + class + no_cycleway + lighting + surface + signals + junctions)`

| Component | Points |
|-----------|--------|
| Speed limit (known, else class default as in the router) | ≥90: +60 · ≥70: +40 · ≥60: +25 · 40–59: 0 · ≤39: −15 |
| Road class | motorway +40 · trunk +25 · primary +15 · secondary +10 · tertiary/unclassified +5 · track +10 · service/path 0 · residential −10 · cycleway −15 · living street −20 |
| No cycle infrastructure on roads ≥ 70 km/h | +30 |
| Lighting | unlit +15 · unknown +5 · lit 0 |
| Surface | cobble +15 · compacted +20 · unpaved +40 |
| Traffic signals | +5 per signal per km |
| Junction density | +3 per junction per km (each edge ends at one), capped at +30 |

Examples: lit residential 50 km/h, 1 km → 43; unlit rural primary 100 km/h
without cycleway, 1 km → 50+60+15+30+15+3 = 173.

## Use in the router
`cost = a·time_s + b·risk·length_km + c·energy` — risk acts as points per km
so long risky stretches add up. With b = 0 the route is the fastest one.

## Runtime adjustments (router, depends on the vehicle)
`web/src/router/profile.ts` → `runtimeRiskPerKm`, constants in
`web/src/config` (`RISK_DIFF_*`, `RISK_MAIN_ROAD_POINTS`, `RISK_CALM_*`,
`RISK_SIGNAL_REFUND_POINTS`). Added to the stored score per km; the edge total
never goes below 0. Edges without a stored score (risk 0) stay 0.

| Term | Points per km |
|------|---------------|
| Speed differential `max(0, limit − vmax)` | × 4 trunk, × 3.5 primary, × 2.5 secondary, × 2 tertiary/unclassified, × 1.5 other — but only × 0.3 when the limit is ≤ 50 (urban) |
| Bundesstraße surcharge (limit > 30) | trunk +50, primary +40 |
| Calm main road (limit ≤ 30) | class points removed: trunk −25, primary −15, secondary −10 |
| Signal refund | −5 per signal (cancels the pipeline's signal points; the wait is in the time cost) |
| Traffic volume (DTV, official counts) | 2,000 → 0 · 8,000 → +20 · ≥ 20,000 → +45 (linear between); × 0.5 for limits ≤ 50, none for ≤ 30 |

Examples for a 45 km/h moped: trunk at 60 → +110/km; tertiary Landstraße at
100 → +110/km; urban road at 50 → +1.5/km; primary at 30 → −15/km. A 25 km/h
mofa on a 100 km/h Landstraße gets +150/km.

Time penalties changed together with this (config): 5 s per signal node (OSM
maps one signalised junction with several nodes) and junction penalties by
class — 0.5 s on trunk/primary/secondary (right of way), 1 s tertiary, 2 s on
smaller streets.

## Calibration (Freiburg, 2026-10-08)
Local Germany tiles, 45 km/h electric, routes checked with street names
against a local rider's choices:
- Tennenbacher/Stefan-Meier-Str. → Tiengener Str./Basler Landstraße: rider
  prefers Eschholzstraße → Markgrafenstraße → Uffhauser Straße over the
  B3/B31 corridor with the 60 km/h Guildfordallee. Before: the B3 stayed in up
  to b = 1.5 and only left at 3; now the rider's route from b = 1.
- Same start → Elsässer Str./Wirthstraße: rider's route via Neunlinden-/
  Hartmannstraße; before it switched to residential rat-runs at b = 1, now it
  stays up to b = 1.
- Known data issue: OSM tags most of Habsburgerstraße (B3 north) as 50 km/h,
  the rider reports 30.

### Personal preferences (−/0/+)
"Routenwahl → Sicherheit im Detail" lets the rider scale single factors with
− (× 0.5), 0 (× 1) or + (× 2), stored with the weights (`mopedmaps.weights.v1`):

| Setting | Scales |
|---------|--------|
| Schnelle Straßen | speed differential and Bundesstraße surcharge |
| Verkehrsaufkommen | DTV points |
| Kreuzungen & Abbiegen | junction-density points (static score) and, in the cost, the signal/junction waits |
| Schlechte Oberfläche | surface points (cobbles 15, compacted 20, unpaved 40) |
| Unbeleuchtet | lighting points (unlit 15, unknown 5) |

Static components are rescaled at runtime from the raw edge attributes (the
constants mirror `pipeline/config.py`). The reported route risk (risk class in
the summary) always uses neutral settings so it stays comparable.

### Traffic volume source
Baden-Württemberg counting stations (Verkehrsministerium BW, dl-de/by-2-0,
5,600 points on A/B/L/K roads, DTV 2024). The pipeline gives each edge the
DTV of the nearest station on a road with the same `ref` within 8 km
(`pipeline/src/mopedmaps_pipeline/traffic.py`); otherwise 0 = unknown. City
streets (Gemeindestraßen) have no free counts; outside BW the value is 0.
Details and other sources: `docs/research-traffic-data.md`.

## Not modelled yet
- Accident statistics; traffic counts outside Baden-Württemberg and on city streets.
- Signal direction (`traffic_signals:direction`) and merging signal nodes of
  one junction in the pipeline; would allow a realistic per-junction wait.
