import { appAttributions } from '../src/ui/attribution';
import { energySummary } from '../src/ui/messages';
import { describe, expect, it } from 'vitest';
import { DEFAULT_UI_WEIGHTS, loadWeights, normalizeWeights, riskClass, saveWeights, WEIGHTS_STORAGE_KEY } from '../src/ui/weights';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('weights', () => {
  it('clamps to slider ranges and keeps energy at 0', () => {
    expect(normalizeWeights({ time: 99, risk: -1, energy: 5 })).toEqual({ time: 2, risk: 0, energy: 3 });
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


describe('energy UI helpers', () => {
  it('formats electric and combustion summaries', () => {
    expect(energySummary('de', 'electric', 523.4, 0, 12.4)).toEqual({ key: 'route.energy.electricWh', params: { climb: '12', wh: '523' } });
    expect(energySummary('de', 'electric', 1520, 0, 3)).toEqual({ key: 'route.energy.electricKwh', params: { climb: '3', kwh: '1,52' } });
    expect(energySummary('en', 'combustion', 3600, 0.4049, 0)).toEqual({ key: 'route.energy.combustion', params: { climb: '0', litres: '0.40' } });
  });

  it('energy weight is clamped and persisted', () => {
    expect(normalizeWeights({ energy: 9 }).energy).toBe(3);
    expect(DEFAULT_UI_WEIGHTS.energy).toBe(0);
  });

  it('attributes the elevation source', () => {
    expect(appAttributions().join(' ')).toMatch(/Copernicus DEM GLO-30/);
  });
});
