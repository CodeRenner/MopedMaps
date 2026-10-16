# Energy model (roadmap step 6)

Implementation: `web/src/router/energy.ts`; constants in `web/src/config/index.ts`.
A deliberately simple physical model ("simple model first", CLAUDE.md).

## Per edge
With v = effective speed (`min(limit, vmax) × surface factor`), m = 150 kg:

- losses = (C_rr·m·g + ½·ρ·CdA·v²) · length  (C_rr 0.012, CdA 0.6 m², ρ 1.2)
- lift = m·g·ascent; release = m·g·descent  (direction-aware)
- accel = signals · ½·m·v²  (stop and go at each traffic signal)
- **wheel energy** = lift + max(0, losses − release) + accel

The descent can offset the edge's own losses but is otherwise braked away, so
an up-and-down hump still costs its climb. Always ≥ 0 (keeps A* valid).

| Drive | Source energy |
|-------|---------------|
| electric | (lift + max(0, losses − release) + accel·(1−0.3)) / 0.8 − 0.3·surplus descent·0.8 (regen 30 %, efficiency 0.8) |
| combustion | wheel / 0.12 / 8900 Wh/l = litres, + idle 0.25 l/h × 10 s per signal |

Sanity check (flat, 45 km/h, 1 km): wheel ≈ 21 Wh → electric ≈ 26 Wh/km,
combustion ≈ 1.9 l/100 km. 25 km/h needs less (aero ∝ v²).

## Routing cost
`cost = a·time_s + b·risk·km + c·wheelWh·1 s/Wh`. Wheel energy (not source
energy) is used so the c slider behaves the same for both drive types.

## Not modelled
Wind, temperature, rider weight variation, battery state of charge, cold
starts, real engine maps. Range/refuel planning (CLAUDE.md "simple model
first") follows in the UI as a range hint.

## Range (step 9)
`web/src/router/range.ts`. The vehicle settings take an optional usable
battery capacity (Wh) or tank size (l) and an optional real average
consumption (Wh/km or l/100 km).

- **Calibration:** the model's consumption is compared with the real value on
  a reference trip (flat, no signals, `RANGE_REFERENCE_SPEED_KMH` = 40 km/h
  capped at vmax). The factor `k = real / reference` (clamped to
  `RANGE_CALIBRATION_MIN..MAX` = 0.3–3) scales every route's modelled energy, so
  hills, speed and signals still change the result relative to that level.
  Reference values of the uncalibrated model: electric 12.2 Wh/km (25 km/h),
  21.6 Wh/km (≥ 40 km/h); petrol 0.91 / 1.62 l/100 km. Real small scooters often
  use more (roughly 25–40 Wh/km, 2–3 l/100 km), which is exactly what the
  calibration is for.
- **Estimate per route:** energy used, consumption on this route, and with a
  capacity the share used, the remaining distance at this route's consumption,
  and a warning when less than `RANGE_RESERVE_SHARE` (15 %) would be left.
  It assumes a full battery/tank at the start.

## Learning from rides
`web/src/router/learning.ts` (pure), `web/src/nav/ride.ts` (what was ridden),
dialog `web/src/ui/rideFeedback.ts`, settings in the vehicle panel. Constants
`LEARN_*` in `web/src/config/index.ts`. Stored locally per drive type
(`mopedmaps.learn.v1.<drive>`), never sent anywhere.

- **Ride:** during navigation the ridden part of each route (reroutes start a
  new one) is booked with the route's modelled energy in proportion to its
  distance; an arrival books the whole route.
- **Electric:** after a ride the app asks for battery % before (default 100)
  and now. Real energy = drop × usable capacity (asked in the dialog if not
  set). Only asked for rides ≥ `LEARN_MIN_KM` (3 km) that are expected to use
  ≥ `LEARN_MIN_SHARE` (10 %) of the battery, and the drop must be ≥
  `LEARN_MIN_DROP_PCT` (3 points): battery displays step in 5–10 %, short rides
  would be noise.
- **Combustion (full-to-full):** a fuel gauge is too coarse, so the app counts
  all navigated rides between two full tanks and compares them with the litres
  refilled. Start with "Tank ist voll" (dialog) or "Vollgetankt" (panel); after
  each ride the dialog takes the refilled litres (or nothing). A fill-up after
  less than `LEARN_MIN_FUEL_KM` (30 km) is not used. Rides without navigation in
  between distort the measurement (stated in the dialog).
- **Factor:** `k = Σ real / Σ modelled` over the newest `LEARN_MAX_SAMPLES` (10)
  samples, clamped like the manual calibration. Longer stretches weigh more.
  Without a manual consumption it is used from the first sample; with one it
  replaces it from `LEARN_TRUST_SAMPLES` (3) samples on. From then on a sample
  whose factor is off by more than `LEARN_OUTLIER_RATIO` (2×) is rejected.
- **When to ask:** after every eligible ride until `LEARN_SAMPLES_TARGET` (5)
  samples, then again after `LEARN_REASK_RIDES` (10) rides or when the last
  answer is older than `LEARN_REASK_DAYS` (30 days), so an ageing battery is
  followed. Combustion asks after every ride while a measurement is open.
- **Skip / don't ask again:** "Überspringen" stores nothing and the next ride
  asks again (e.g. ridden with a passenger). For combustion it also drops the
  open measurement, since that ride's fuel ends up in the next fill-up.
  "Nicht mehr fragen" stops the questions; the vehicle panel switches them back
  on and can delete what was learned.
- **Limits:** only navigated rides are learned (the app knows no other track;
  no background GPS on iOS). One factor only: a few coarse samples cannot
  separate rolling, air and climbing losses. Temperature is not modelled, so
  cold rides are best skipped.
