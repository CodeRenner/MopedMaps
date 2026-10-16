/** Load/save the consumption learned from rides, per drive type (Wh vs. litres). */

import type { Drive } from '../router/profile';
import { DEFAULT_LEARN_STATE, type FuelWindow, type LearnState, type Sample } from '../router/learning';
import type { KeyValueStorage } from './profileStore';

export const learnStorageKey = (drive: Drive) => `mopedmaps.learn.v1.${drive}`;

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const nonNeg = (x: unknown): x is number => num(x) && x >= 0;

function sample(x: unknown): Sample | null {
  const s = x as Partial<Sample> | null;
  return s && num(s.at) && nonNeg(s.km) && num(s.modelled) && s.modelled > 0 && num(s.real) && s.real > 0
    ? { at: s.at, km: s.km, modelled: s.modelled, real: s.real }
    : null;
}

function fuelWindow(x: unknown): FuelWindow | null {
  const w = x as Partial<FuelWindow> | null;
  return w && num(w.since) && nonNeg(w.km) && nonNeg(w.modelled) ? { since: w.since, km: w.km, modelled: w.modelled } : null;
}

export function loadLearnState(storage: KeyValueStorage | null, drive: Drive): LearnState {
  try {
    const raw = storage?.getItem(learnStorageKey(drive));
    if (!raw) return DEFAULT_LEARN_STATE;
    const s = JSON.parse(raw) as Partial<LearnState>;
    return {
      samples: Array.isArray(s.samples) ? s.samples.map(sample).filter((x): x is Sample => x !== null) : [],
      ridesSinceAnswer: nonNeg(s.ridesSinceAnswer) ? Math.floor(s.ridesSinceAnswer) : 0,
      lastAnswerAt: num(s.lastAnswerAt) ? s.lastAnswerAt : null,
      optOut: s.optOut === true,
      fuel: fuelWindow(s.fuel),
    };
  } catch {
    return DEFAULT_LEARN_STATE; // corrupt JSON or storage blocked
  }
}

export function saveLearnState(storage: KeyValueStorage | null, drive: Drive, s: LearnState): void {
  try {
    storage?.setItem(learnStorageKey(drive), JSON.stringify(s));
  } catch {
    // storage full or blocked: keep in memory for this session
  }
}
