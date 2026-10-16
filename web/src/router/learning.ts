/**
 * Learning the vehicle's real consumption from rides. Pure; documented in
 * docs/energy-model.md ("Learning from rides").
 *
 * Each sample pairs the model's (uncalibrated) energy for a stretch of
 * navigated riding with what the rider reports:
 * - electric: battery % before/after one ride × usable capacity (Wh)
 * - combustion: litres refilled at a full tank after all navigated rides since
 *   the previous full tank (full-to-full method; a fuel gauge is too coarse)
 * The learned factor Σ real / Σ modelled scales every route's modelled energy
 * like the manual calibration in range.ts, so hills, speed and signals keep
 * their relative effect. Longer stretches weigh more by construction.
 */

import * as cfg from '../config';
import type { Drive } from './profile';

export interface Sample {
  /** When it was recorded (ms since epoch). */
  at: number;
  km: number;
  /** Modelled energy: Wh (electric) or litres (combustion). */
  modelled: number;
  /** Reported energy, same unit. */
  real: number;
}

/** Combustion: navigated riding since the last full tank. */
export interface FuelWindow {
  since: number;
  km: number;
  modelled: number;
}

export interface LearnState {
  /** Newest last, at most LEARN_MAX_SAMPLES. */
  samples: Sample[];
  /** Rides (>= LEARN_MIN_KM) since the last saved sample. */
  ridesSinceAnswer: number;
  lastAnswerAt: number | null;
  /** "Don't ask again". */
  optOut: boolean;
  fuel: FuelWindow | null;
}

export const DEFAULT_LEARN_STATE: LearnState = {
  samples: [],
  ridesSinceAnswer: 0,
  lastAnswerAt: null,
  optOut: false,
  fuel: null,
};

/** A finished navigated ride: ridden distance and the model's energy for it (uncalibrated). */
export interface Ride {
  km: number;
  energyWh: number;
  fuelL: number;
}

const DAY_MS = 86_400_000;

export const rideModelled = (drive: Drive, r: Ride) => (drive === 'electric' ? r.energyWh : r.fuelL);

const clampFactor = (k: number) => Math.min(cfg.RANGE_CALIBRATION_MAX, Math.max(cfg.RANGE_CALIBRATION_MIN, k));

/** Learned factor real/modelled over all samples (clamped), null without samples. */
export function learnedFactor(s: LearnState): number | null {
  let real = 0;
  let modelled = 0;
  for (const x of s.samples) {
    real += x.real;
    modelled += x.modelled;
  }
  return modelled > 0 ? clampFactor(real / modelled) : null;
}

/** Whether the learned factor should replace a manually entered consumption. */
export const learnedTrusted = (s: LearnState) => s.samples.length >= cfg.LEARN_TRUST_SAMPLES;

/** Book a finished ride: counts it and adds it to an open fuel window. */
export function recordRide(s: LearnState, drive: Drive, r: Ride): LearnState {
  const fuel =
    drive === 'combustion' && s.fuel
      ? { ...s.fuel, km: s.fuel.km + r.km, modelled: s.fuel.modelled + r.fuelL }
      : s.fuel;
  return { ...s, fuel, ridesSinceAnswer: s.ridesSinceAnswer + (r.km >= cfg.LEARN_MIN_KM ? 1 : 0) };
}

/** Still learning, or time for a check (every LEARN_REASK_RIDES rides or LEARN_REASK_DAYS days). */
export function isDue(s: LearnState, now: number): boolean {
  if (s.samples.length < cfg.LEARN_SAMPLES_TARGET) return true;
  if (s.ridesSinceAnswer >= cfg.LEARN_REASK_RIDES) return true;
  return s.lastAnswerAt !== null && now - s.lastAnswerAt >= cfg.LEARN_REASK_DAYS * DAY_MS;
}

/**
 * Question to show after a ride (call after recordRide):
 * - battery: ask battery % before/after
 * - fuel-start: ask to fill up and start a full-to-full measurement
 * - fuel-ride: a measurement is open: count this ride, optionally enter a fill-up
 */
export type Prompt = 'none' | 'battery' | 'fuel-start' | 'fuel-ride';

export function promptAfterRide(
  s: LearnState,
  drive: Drive,
  r: Ride,
  opts: { capacity: number | null; factor: number; now: number },
): Prompt {
  if (s.optOut || r.km < cfg.LEARN_MIN_KM) return 'none';
  if (drive === 'combustion') {
    if (s.fuel) return 'fuel-ride'; // every ride must be confirmed (or excluded)
    return isDue(s, opts.now) ? 'fuel-start' : 'none';
  }
  if (!isDue(s, opts.now)) return 'none';
  // Too small a share of the battery: the display's steps would dominate.
  if (opts.capacity !== null && (r.energyWh * opts.factor) / opts.capacity < cfg.LEARN_MIN_SHARE) return 'none';
  return r.energyWh > 0 ? 'battery' : 'none';
}

export type Outcome = 'saved' | 'invalid' | 'outlier' | 'too-short';

function addSample(s: LearnState, x: Sample): { state: LearnState; outcome: Outcome } {
  const ratio = x.real / x.modelled;
  const k = learnedFactor(s);
  const off =
    ratio < cfg.RANGE_CALIBRATION_MIN ||
    ratio > cfg.RANGE_CALIBRATION_MAX ||
    (k !== null && learnedTrusted(s) && (ratio > k * cfg.LEARN_OUTLIER_RATIO || ratio < k / cfg.LEARN_OUTLIER_RATIO));
  if (off) return { state: s, outcome: 'outlier' };
  return {
    state: {
      ...s,
      samples: [...s.samples, x].slice(-cfg.LEARN_MAX_SAMPLES),
      ridesSinceAnswer: 0,
      lastAnswerAt: x.at,
    },
    outcome: 'saved',
  };
}

/** Electric: battery % before and after the ride (0-100), usable capacity in Wh. */
export function submitBattery(
  s: LearnState,
  r: Ride,
  startPct: number,
  endPct: number,
  capacityWh: number,
  now: number,
): { state: LearnState; outcome: Outcome } {
  const ok =
    Number.isFinite(startPct) && Number.isFinite(endPct) && endPct >= 0 && startPct <= 100 &&
    startPct - endPct >= cfg.LEARN_MIN_DROP_PCT && capacityWh > 0 && r.energyWh > 0;
  if (!ok) return { state: s, outcome: 'invalid' };
  const real = ((startPct - endPct) / 100) * capacityWh;
  return addSample(s, { at: now, km: r.km, modelled: r.energyWh, real });
}

/** Combustion: the tank is full now; navigated rides count from here. */
export function startFuelWindow(s: LearnState, now: number): LearnState {
  return { ...s, fuel: { since: now, km: 0, modelled: 0 } };
}

/**
 * Combustion: filled up to full with `litres`. Closes the open window as a
 * sample; while still learning a new window starts (the tank is full again).
 */
export function submitFill(s: LearnState, litres: number, now: number): { state: LearnState; outcome: Outcome } {
  const w = s.fuel;
  if (!w || !(litres > 0)) return { state: s, outcome: 'invalid' };
  if (w.km < cfg.LEARN_MIN_FUEL_KM || !(w.modelled > 0)) {
    return { state: startFuelWindow(s, now), outcome: 'too-short' };
  }
  const res = addSample(s, { at: now, km: w.km, modelled: w.modelled, real: litres });
  const keepMeasuring = res.state.samples.length < cfg.LEARN_SAMPLES_TARGET;
  return {
    state: keepMeasuring ? startFuelWindow(res.state, now) : { ...res.state, fuel: null },
    outcome: res.outcome,
  };
}

/**
 * "Skip": the ride is not counted. Electric: nothing is stored, the next ride
 * asks again. Combustion: its fuel will be in the next fill-up, so the open
 * measurement is dropped and restarts at the next full tank.
 */
export function skipRide(s: LearnState, drive: Drive): LearnState {
  return drive === 'combustion' ? { ...s, fuel: null } : s;
}

export function setAsking(s: LearnState, ask: boolean): LearnState {
  return { ...s, optOut: !ask };
}

/** Forget all samples and any open measurement (keeps the ask setting). */
export function resetLearning(s: LearnState): LearnState {
  return { ...DEFAULT_LEARN_STATE, optOut: s.optOut };
}
