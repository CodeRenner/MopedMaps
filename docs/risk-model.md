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

## Not modelled yet
- Speed differential to the user's vehicle (25 km/h mofa on a 100 km/h road
  is worse than a 45 km/h moped). Can be added at runtime from vmax and the
  stored limit without changing the format.
- Accident statistics, traffic volume (no live data by design).
