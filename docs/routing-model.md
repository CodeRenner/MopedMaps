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
| Cycleways/footways/tracks only with explicit `moped`/`mofa`/`motor_vehicle` permission (tracks: user decision 2026-10-08, "nur bei Schild") | pipeline `tags.py` |
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

## Turns
The router searches over directed road pieces (arcs) instead of junctions, so the turn between two
consecutive pieces can be priced (`web/src/router/turns.ts`, constants `TURN_*` in config):

- **Free:** going straight or bending less than 35° (also a road that just changes its name); junctions
  without an alternative; following the main road where it bends (*abknickende Vorfahrt*: incoming and
  outgoing road of the same class and every other way out is a lower class).
- **Right turn:** 1 / 3 / 8 s (slight 35–60°, normal 60–135°, sharp). **Left turn:** 2 / 6 / 12 s plus
  2 risk points for normal/sharp (crossing oncoming traffic). **U-turn** on the same road: 60 s.
- Headings are measured over 20 m before/after the junction so shape wiggles don't count.
- "Routenwahl → Sicherheit im Detail → Abbiegen" scales the turn costs (× 0.5 / 1 / 2). Main roads
  with many side streets are not penalised for them: driving straight past a junction is free.
- The shown travel time includes the (unscaled) turn time.

Calibration (live tiles, safety 1.5): KKH Emmendingen → Rennweg 16 turns with "0", 14 with "+";
Hbf → Waldkirch 14 → 12; the earlier Freiburg rider routes are unchanged.
