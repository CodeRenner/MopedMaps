/** Cost weights: clamping, persistence and risk classification. Pure. */

import {
  RISK_CLASS_LOW_MAX,
  RISK_CLASS_MEDIUM_MAX,
  WEIGHT_ENERGY_RANGE,
  WEIGHT_RISK_RANGE,
  WEIGHT_TIME_RANGE,
} from '../config';
import type { CostWeights } from '../router/profile';
import type { KeyValueStorage } from './profileStore';

export const WEIGHTS_STORAGE_KEY = 'mopedmaps.weights.v1';

export const DEFAULT_UI_WEIGHTS: CostWeights = {
  time: WEIGHT_TIME_RANGE.default,
  risk: WEIGHT_RISK_RANGE.default,
  energy: WEIGHT_ENERGY_RANGE.default,
};

const clamp = (v: unknown, r: { min: number; max: number }, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : fallback;

export function normalizeWeights(w: Partial<CostWeights>): CostWeights {
  return {
    time: clamp(w.time, WEIGHT_TIME_RANGE, DEFAULT_UI_WEIGHTS.time),
    risk: clamp(w.risk, WEIGHT_RISK_RANGE, DEFAULT_UI_WEIGHTS.risk),
    energy: clamp(w.energy, WEIGHT_ENERGY_RANGE, DEFAULT_UI_WEIGHTS.energy),
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
