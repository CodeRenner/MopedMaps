/** Cost weights: clamping, persistence and risk classification. Pure. */

import {
  RISK_PREF_FACTORS,
  RISK_CLASS_LOW_MAX,
  RISK_CLASS_MEDIUM_MAX,
  WEIGHT_ENERGY_RANGE,
  WEIGHT_RISK_RANGE,
  WEIGHT_TIME_RANGE,
} from '../config';
import { type CostWeights, NEUTRAL_PREFS, type RiskPrefs } from '../router/profile';
import type { KeyValueStorage } from './profileStore';

export const WEIGHTS_STORAGE_KEY = 'mopedmaps.weights.v1';

export const DEFAULT_UI_WEIGHTS: CostWeights = {
  time: WEIGHT_TIME_RANGE.default,
  risk: WEIGHT_RISK_RANGE.default,
  energy: WEIGHT_ENERGY_RANGE.default,
  prefs: NEUTRAL_PREFS,
};

export const RISK_PREF_KEYS = ['fast', 'traffic', 'junctions', 'surface', 'lighting'] as const;
const ALLOWED_FACTORS: readonly number[] = Object.values(RISK_PREF_FACTORS);

/** Only 0.5 / 1 / 2 are valid; anything else falls back to 1. */
export function normalizePrefs(p: Partial<Record<keyof RiskPrefs, unknown>> | undefined): RiskPrefs {
  const out = { ...NEUTRAL_PREFS };
  for (const k of RISK_PREF_KEYS) {
    const v = p?.[k];
    if (typeof v === 'number' && ALLOWED_FACTORS.includes(v)) out[k] = v;
  }
  return out;
}

const clamp = (v: unknown, r: { min: number; max: number }, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : fallback;

export function normalizeWeights(w: Partial<CostWeights>): CostWeights {
  return {
    time: clamp(w.time, WEIGHT_TIME_RANGE, DEFAULT_UI_WEIGHTS.time),
    risk: clamp(w.risk, WEIGHT_RISK_RANGE, DEFAULT_UI_WEIGHTS.risk),
    energy: clamp(w.energy, WEIGHT_ENERGY_RANGE, DEFAULT_UI_WEIGHTS.energy),
    prefs: normalizePrefs(w.prefs),
  };
}

export function loadWeights(storage: KeyValueStorage | null): CostWeights {
  try {
    const raw = storage?.getItem(WEIGHTS_STORAGE_KEY);
    return raw ? normalizeWeights(JSON.parse(raw) as Partial<CostWeights>) : DEFAULT_UI_WEIGHTS;
  } catch {
    return DEFAULT_UI_WEIGHTS;
  }
}

export function saveWeights(storage: KeyValueStorage | null, w: CostWeights): void {
  try {
    storage?.setItem(WEIGHTS_STORAGE_KEY, JSON.stringify(w));
  } catch {
    // ignore: per-device convenience only
  }
}

export type RiskClass = 'low' | 'medium' | 'high';

export function riskClass(riskAvg: number): RiskClass {
  if (riskAvg <= RISK_CLASS_LOW_MAX) return 'low';
  if (riskAvg <= RISK_CLASS_MEDIUM_MAX) return 'medium';
  return 'high';
}
