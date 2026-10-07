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
