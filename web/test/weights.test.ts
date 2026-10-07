import { describe, expect, it } from 'vitest';
import { DEFAULT_UI_WEIGHTS, loadWeights, normalizeWeights, riskClass, saveWeights, WEIGHTS_STORAGE_KEY } from '../src/ui/weights';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('weights', () => {
  it('clamps to slider ranges and keeps energy at 0', () => {
    expect(normalizeWeights({ time: 99, risk: -1, energy: 5 })).toEqual({ time: 2, risk: 0, energy: 0 });
    expect(normalizeWeights({})).toEqual(DEFAULT_UI_WEIGHTS);
    expect(normalizeWeights({ time: Number.NaN })).toEqual(DEFAULT_UI_WEIGHTS);
  });

  it('round-trips and survives corrupt storage', () => {
    const s = mem();
    saveWeights(s, { time: 1.5, risk: 2, energy: 0 });
    expect(loadWeights(s)).toEqual({ time: 1.5, risk: 2, energy: 0 });
    s.m.set(WEIGHTS_STORAGE_KEY, 'nope');
    expect(loadWeights(s)).toEqual(DEFAULT_UI_WEIGHTS);
    expect(loadWeights(null)).toEqual(DEFAULT_UI_WEIGHTS);
  });

  it('classifies route risk', () => {
    expect(riskClass(43)).toBe('low');
    expect(riskClass(60)).toBe('low');
    expect(riskClass(75)).toBe('medium');
    expect(riskClass(173)).toBe('high');
  });
});
