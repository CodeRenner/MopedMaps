import { describe, expect, it } from 'vitest';
import {
  calibrationFactor,
  DEFAULT_ENERGY_SETTINGS,
  estimateRange,
  referenceConsumption,
} from '../src/router/range';
import { loadEnergySettings, parsePositive, saveEnergySettings } from '../src/ui/profileStore';

const EL = { vmaxKmh: 45, drive: 'electric' } as const;
const PETROL = { vmaxKmh: 45, drive: 'combustion' } as const;

describe('reference consumption', () => {
  it('is in a plausible range for small vehicles', () => {
    const wh = referenceConsumption(EL);
    expect(wh).toBeGreaterThan(10);
    expect(wh).toBeLessThan(60); // Wh/km for an e-scooter at 40 km/h
    const l = referenceConsumption(PETROL);
    expect(l).toBeGreaterThan(0.5);
    expect(l).toBeLessThan(5); // l/100 km
  });
  it('is lower for a 25 km/h mofa (slower reference)', () => {
    expect(referenceConsumption({ vmaxKmh: 25, drive: 'electric' })).toBeLessThan(referenceConsumption(EL));
  });
});

describe('calibration', () => {
  it('is 1 without real consumption, real/ref otherwise, clamped', () => {
    expect(calibrationFactor(EL, DEFAULT_ENERGY_SETTINGS)).toBe(1);
    const ref = referenceConsumption(EL);
    expect(calibrationFactor(EL, { ...DEFAULT_ENERGY_SETTINGS, realConsumption: ref * 1.5 })).toBeCloseTo(1.5);
    expect(calibrationFactor(EL, { ...DEFAULT_ENERGY_SETTINGS, realConsumption: ref * 100 })).toBe(3);
    expect(calibrationFactor(EL, { ...DEFAULT_ENERGY_SETTINGS, realConsumption: 0 })).toBe(1);
  });
});

describe('estimateRange', () => {
  const route = { distanceM: 20_000, energyWh: 600, fuelL: 0 };

  it('without capacity reports only usage', () => {
    const r = estimateRange(EL, DEFAULT_ENERGY_SETTINGS, route);
    expect(r.used).toBe(600);
    expect(r.perKmUnit).toBe(30);
    expect(r.usedShare).toBeNull();
    expect(r.remainingKm).toBeNull();
    expect(r.belowReserve).toBe(false);
  });

  it('with capacity: share used, remaining km at route consumption, reserve warning', () => {
    const r = estimateRange(EL, { ...DEFAULT_ENERGY_SETTINGS, capacity: 2000 }, route);
    expect(r.usedShare).toBeCloseTo(0.3);
    expect(r.remainingKm).toBeCloseTo(1400 / 30);
    expect(r.belowReserve).toBe(false);
    const tight = estimateRange(EL, { ...DEFAULT_ENERGY_SETTINGS, capacity: 650 }, route);
    expect(tight.belowReserve).toBe(true);
    const over = estimateRange(EL, { ...DEFAULT_ENERGY_SETTINGS, capacity: 500 }, route);
    expect(over.remainingKm).toBe(0);
    expect(over.belowReserve).toBe(true);
  });

  it('applies the calibration factor (combustion in litres and l/100 km)', () => {
    const ref = referenceConsumption(PETROL);
    const s = { ...DEFAULT_ENERGY_SETTINGS, capacity: 7, realConsumption: ref * 2 };
    const r = estimateRange(PETROL, s, { distanceM: 50_000, energyWh: 0, fuelL: 1 });
    expect(r.used).toBeCloseTo(2);
    expect(r.perKmUnit).toBeCloseTo(4);
    expect(r.remainingKm).toBeCloseTo(125);
  });
});

describe('energy settings storage', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it('round-trips and sanitises', () => {
    const st = mem();
    expect(loadEnergySettings(st, 'electric')).toEqual(DEFAULT_ENERGY_SETTINGS);
    saveEnergySettings(st, 'electric', { capacity: 1500, realConsumption: 32, reserveShare: 0.2 });
    expect(loadEnergySettings(st, 'electric')).toEqual({ capacity: 1500, realConsumption: 32, reserveShare: 0.2 });
    // kept per drive type: litres don't mix with Wh
    expect(loadEnergySettings(st, 'combustion')).toEqual(DEFAULT_ENERGY_SETTINGS);
    st.setItem('mopedmaps.energy.v1.electric', '{"capacity":-3,"realConsumption":"x","reserveShare":7}');
    expect(loadEnergySettings(st, 'electric')).toEqual(DEFAULT_ENERGY_SETTINGS);
    st.setItem('mopedmaps.energy.v1.electric', '{broken');
    expect(loadEnergySettings(st, 'electric')).toEqual(DEFAULT_ENERGY_SETTINGS);
    expect(loadEnergySettings(null, 'electric')).toEqual(DEFAULT_ENERGY_SETTINGS);
  });

  it('parses positive numbers with comma decimals', () => {
    expect(parsePositive('4,5')).toBe(4.5);
    expect(parsePositive(' 1200 ')).toBe(1200);
    expect(parsePositive('')).toBeNull();
    expect(parsePositive('0')).toBeNull();
    expect(parsePositive('abc')).toBeNull();
  });
});

describe('range summary text', () => {
  it('formats share, remaining km and reserve warning', async () => {
    const { rangeSummary } = await import('../src/ui/messages');
    const base = { used: 600, perKmUnit: 30, usedShare: 0.29, remainingKm: 47.4, belowReserve: false };
    expect(rangeSummary('de', 'electric', base, 0.15)).toEqual({
      key: 'route.range.electric', params: { share: '29', km: '47' }, warning: null,
    });
    expect(rangeSummary('de', 'combustion', { ...base, usedShare: 0.9, remainingKm: 4.25, belowReserve: true }, 0.15)).toEqual({
      key: 'route.range.combustion', params: { share: '90', km: '4,3' },
      warning: { key: 'route.range.reserve', params: { reserve: '15' } },
    });
    expect(rangeSummary('en', 'electric', { ...base, usedShare: null, remainingKm: null }, 0.15)).toBeNull();
    expect(rangeSummary('de', 'electric', { ...base, usedShare: 1.07, remainingKm: 0, belowReserve: true }, 0.15)).toEqual({
      key: 'route.range.electricShort', params: { share: '107' }, warning: { key: 'route.range.short', params: {} },
    });
  });
});
