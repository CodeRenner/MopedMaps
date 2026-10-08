/**
 * Route profile (distance, elevation, speed along a route) and climb from it.
 * Pure; runs in the router worker. See docs/elevation.md.
 */

import { CLIMB_HYSTERESIS_M } from '../config';

export interface RouteProfile {
  /** Cumulative distance at each route node (m); starts at 0. */
  distM: number[];
  /** Height at each route node (m), null if unknown (v1 tiles or no DEM). */
  heightM: (number | null)[];
  /** Effective speed on each traversed edge (km/h); one fewer than nodes. */
  speedKmh: number[];
  /** Posted limit on each traversed edge (km/h, class default if unknown). */
  limitKmh: number[];
  /** Index into the route geometry where each node lies (same length as distM). */
  geomIndex: number[];
}

/**
 * Total climb with hysteresis: a rise only counts once the height has gone up
 * by at least `thresholdM` from the last low, and a descent only resets the
 * low after falling `thresholdM` below the last high. Ripples smaller than the
 * threshold (DEM noise, bridges) are ignored; real climbs count in full.
 * Unknown (null/NaN) heights are skipped.
 */
export function climbWithHysteresis(
  heights: readonly (number | null)[],
  thresholdM: number = CLIMB_HYSTERESIS_M,
): number {
  let climb = 0;
  let rising = false;
  let low = Number.NaN;
  let high = Number.NaN;
  for (const h of heights) {
    if (h === null || !Number.isFinite(h)) continue;
    if (Number.isNaN(low)) {
      low = high = h;
      continue;
    }
    if (rising) {
      if (h > high) high = h;
      else if (high - h >= thresholdM) {
        climb += high - low;
        rising = false;
        low = h;
      }
    } else if (h < low) low = h;
    else if (h - low >= thresholdM) {
      rising = true;
      high = h;
    }
  }
  if (rising) climb += high - low;
  return climb;
}

/** True if every node of the profile has a known height. */
export function hasFullHeights(p: RouteProfile): boolean {
  return p.heightM.length > 0 && p.heightM.every((h) => h !== null);
}
