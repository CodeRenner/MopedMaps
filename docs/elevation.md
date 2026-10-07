# Elevation (roadmap step 6)

Source: Copernicus DEM GLO-30 (1 arc-second, AWS open data bucket
`copernicus-dem-30m`). Attribution: © DLR e.V. 2010-2014 and © Airbus Defence
and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and
ESA. Reader: `pipeline/src/mopedmaps_pipeline/dem.py` (tifffile + numpy; TIFF
float predictor decoded in numpy, no `imagecodecs`).

Build: `python -m mopedmaps_pipeline build IN.osm.pbf OUT --dem data/dem`.

## Method
GLO-30 is a *surface* model: buildings and trees are included, so raw heights
at junctions carry 1–3 m of noise. Measured on Bremen (59.5k edges):

| Approach | Ascent per km of road | Notes |
|----------|----------------------|-------|
| Raw node heights, per-edge difference | 8.9 m/km | noise adds up over short urban edges |
| Profile every 30 m + median + 3 m hysteresis | 9.3 m/km | noise mostly between edges, not within |
| 3×3 / 5×5 pixel minimum | 4–5.5 m/km | negative heights near the Weser (water) |
| **Node heights + 10× Laplacian smoothing (α 0.5)** | **1.94 m/km** | heights 0–42 m; chosen |

Chosen: sample the DEM (bilinear) at every junction node, smooth heights over
the graph (`z ← ½z + ½·mean(neighbours)`, 10 iterations), then per edge
`ascent = max(0, Δz)`, `descent = max(0, −Δz)` in from→to direction. Node
heights are shared, so climbs along a route telescope correctly.

Bremen gradients after smoothing: median 0.10 %, p90 0.54 %, p99 1.6 %,
max 3.3 % — plausible for a flat city with dykes and bridges.

## Limitations
- A hill in the middle of a long edge with ends at similar height is missed.
- Smoothing flattens very short steep ramps (bridge approaches).
- Should be re-checked in hilly terrain (e.g. Weserbergland) before tuning.

## Route climb (client)
The router returns a route profile: cumulative distance, node height and
effective speed per edge (`web/src/router/routeProfile.ts`). With format v2
tiles every route node has a smoothed height, and the summary climb is the
profile's total rise with hysteresis `CLIMB_HYSTERESIS_M` (5 m, in
`web/src/config`): a rise counts only once it reaches the threshold from the
last low, and a fall only resets the low after dropping the threshold below the
last high. Real hills count in full; ripples from DEM noise, bridges and
embankments don't. With v1 tiles (no node heights) the summary falls back to
the sum of per-edge climbs.

Calibration (Bremen v2 tiles, Hbf -> Vegesack, 19.9 km, node heights 3.8-29.5 m):
threshold 0 m -> 88 m, 3 m -> 72 m, 5 m -> 63 m, 10 m -> 43 m climb. GLO-30 is
a surface model (buildings, trees) with a few metres of vertical error, so 5 m
was chosen.
