# Routing model

Implementation: `web/src/router/profile.ts`, constants in `web/src/config/index.ts`.
All numbers are first guesses meant to be tuned.

## Vehicle profile
- `vmaxKmh` (presets 25 / 45, free input 6–200), `drive` (`electric` | `combustion`).

## Access (per query, not baked into the graph)
| Rule | Source |
|------|--------|
| vmax ≤ 25 → edge needs the MOFA flag; otherwise the MOPED flag | `MOFA_MAX_VMAX_KMH` |
| vmax < 60 → no motorway class and no `motorroad=yes` edges (StVO §18: design speed > 60 km/h required) | `MOTORWAY_MIN_VMAX_KMH` |
| Cycleways/footways only with explicit `moped`/`mofa`/`motor_vehicle` permission | pipeline `tags.py` |
| Oneway restrictions | graph arcs |

## Travel time
`time = length / v + signals·10 s + 2 s (junction) + curvature°·0.02 s`

`v = min(maxspeed, vmax) × surface factor`. If maxspeed is unknown, a
per-class default is used (through roads 100, residential 50, living street 7,
service/track 30, cycleway/path 25), then capped at vmax.

Surface factors: paved/unknown 1.0, cobble 0.8, compacted 0.7, unpaved 0.5.

`access=destination` adds 120 s of cost (not time) to discourage through traffic.

## Generalised cost
`cost = a·time + b·risk + c·energy`. Currently only `a·time`; risk follows in
roadmap step 5 and energy in step 6.

## Known gaps
- No urban/rural flag in the graph yet: unknown limits on through roads in
  towns are over-estimated (100 instead of 50, capped by vmax anyway for
  25/45 km/h vehicles).
- No turn penalties between edges yet (only curvature within an edge).
