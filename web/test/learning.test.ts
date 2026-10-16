import { describe, expect, it } from 'vitest';
import * as cfg from '../src/config';
import {
  DEFAULT_LEARN_STATE,
  isDue,
  type LearnState,
  learnedFactor,
  promptAfterRide,
  recordRide,
  resetLearning,
  setAsking,
  skipRide,
  startFuelWindow,
  submitBattery,
  submitFill,
} from '../src/router/learning';
import { RideMeter } from '../src/nav/ride';
import { calibrationFactor, DEFAULT_ENERGY_SETTINGS, estimateRange, referenceConsumption } from '../src/router/range';
import { learnStorageKey, loadLearnState, saveLearnState } from '../src/ui/learningStore';
import { parsePercent } from '../src/ui/rideFeedback';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1);
const ride = (km: number, energyWh: number, fuelL = 0) => ({ km, energyWh, fuelL });
const EL = { vmaxKmh: 45, drive: 'electric' } as const;
const opts = { capacity: 1500, factor: 1, now: T0 };

/** n saved battery rides, each really using `ratio` × the modelled 300 Wh. */
function learnedBattery(n: number, ratio = 1.5): LearnState {
  let s = DEFAULT_LEARN_STATE;
  for (let i = 0; i < n; i++) {
    s = recordRide(s, 'electric', ride(10, 300));
    s = submitBattery(s, ride(10, 300), 100, 100 - 20 * ratio, 1500, T0 + i).state;
  }
  return s;
}

describe('learned factor', () => {
  it('is Σ real / Σ modelled, so longer rides weigh more', () => {
    expect(learnedFactor(DEFAULT_LEARN_STATE)).toBeNull();
    const s: LearnState = {
      ...DEFAULT_LEARN_STATE,
      samples: [
        { at: 0, km: 30, modelled: 900, real: 1350 }, // 1.5
        { at: 1, km: 10, modelled: 300, real: 300 }, // 1.0
      ],
    };
    expect(learnedFactor(s)).toBeCloseTo(1650 / 1200);
  });

  it('battery % × capacity gives the real energy', () => {
    // 300 Wh modelled, 100 % -> 70 % of 1500 Wh = 450 Wh -> 1.5
    const r = submitBattery(DEFAULT_LEARN_STATE, ride(10, 300), 100, 70, 1500, T0);
    expect(r.outcome).toBe('saved');
    expect(learnedFactor(r.state)).toBeCloseTo(1.5);
    expect(r.state.ridesSinceAnswer).toBe(0);
    expect(r.state.lastAnswerAt).toBe(T0);
    expect(learnedFactor(learnedBattery(4))).toBeCloseTo(1.5);
  });

  it('rejects invalid input and implausible values', () => {
    const s = DEFAULT_LEARN_STATE;
    expect(submitBattery(s, ride(10, 300), 70, 80, 1500, T0).outcome).toBe('invalid'); // rose
    expect(submitBattery(s, ride(10, 300), 80, 79, 1500, T0).outcome).toBe('invalid'); // below min drop
    expect(submitBattery(s, ride(10, 300), 120, 50, 1500, T0).outcome).toBe('invalid');
    expect(submitBattery(s, ride(10, 300), 100, 0, 1500, T0).outcome).toBe('outlier'); // 5x the model
  });

  it('rejects outliers once enough samples are trusted', () => {
    const s = learnedBattery(cfg.LEARN_TRUST_SAMPLES); // k = 1.5
    // 0.6 x the model is below 1.5 / LEARN_OUTLIER_RATIO
    const low = submitBattery(s, ride(10, 300), 100, 88, 1500, T0); // 180 Wh -> 0.6
    expect(low.outcome).toBe('outlier');
    expect(low.state).toBe(s);
    // with fewer samples the same ride is accepted
    expect(submitBattery(learnedBattery(1), ride(10, 300), 100, 88, 1500, T0).outcome).toBe('saved');
  });

  it('keeps only the newest samples', () => {
    expect(learnedBattery(cfg.LEARN_MAX_SAMPLES + 3).samples).toHaveLength(cfg.LEARN_MAX_SAMPLES);
  });
});

describe('when to ask', () => {
  it('asks after every ride while learning, then every N rides or after a month', () => {
    let s = learnedBattery(cfg.LEARN_SAMPLES_TARGET - 1);
    s = recordRide(s, 'electric', ride(10, 300));
    expect(promptAfterRide(s, 'electric', ride(10, 300), opts)).toBe('battery');
    s = submitBattery(s, ride(10, 300), 100, 70, 1500, T0).state;
    expect(s.samples).toHaveLength(cfg.LEARN_SAMPLES_TARGET);
    for (let i = 1; i < cfg.LEARN_REASK_RIDES; i++) {
      s = recordRide(s, 'electric', ride(10, 300));
      expect(promptAfterRide(s, 'electric', ride(10, 300), opts)).toBe('none');
    }
    s = recordRide(s, 'electric', ride(10, 300));
    expect(promptAfterRide(s, 'electric', ride(10, 300), opts)).toBe('battery');
    // Not enough rides, but the last answer is a month old
    const fresh = { ...s, ridesSinceAnswer: 1 };
    expect(isDue(fresh, T0 + 5 * DAY)).toBe(false);
    expect(isDue(fresh, T0 + cfg.LEARN_REASK_DAYS * DAY)).toBe(true);
  });

  it('skip keeps asking next time; "never" stops it', () => {
    let s = recordRide(DEFAULT_LEARN_STATE, 'electric', ride(10, 300));
    s = skipRide(s, 'electric');
    expect(s.samples).toHaveLength(0);
    expect(promptAfterRide(s, 'electric', ride(10, 300), opts)).toBe('battery');
    s = setAsking(s, false);
    expect(promptAfterRide(s, 'electric', ride(10, 300), opts)).toBe('none');
    expect(resetLearning(s).optOut).toBe(true);
  });

  it('does not ask after short rides or a tiny share of the battery', () => {
    const s = DEFAULT_LEARN_STATE;
    expect(promptAfterRide(s, 'electric', ride(cfg.LEARN_MIN_KM - 0.5, 100), opts)).toBe('none');
    expect(recordRide(s, 'electric', ride(1, 30)).ridesSinceAnswer).toBe(0);
    // 100 Wh of 1500 Wh = 6.7 % < 10 %; with a learned factor of 2 it is 13 %
    expect(promptAfterRide(s, 'electric', ride(5, 100), opts)).toBe('none');
    expect(promptAfterRide(s, 'electric', ride(5, 100), { ...opts, factor: 2 })).toBe('battery');
    // capacity unknown: the dialog asks for it
    expect(promptAfterRide(s, 'electric', ride(5, 100), { ...opts, capacity: null })).toBe('battery');
  });
});

describe('combustion: full-to-full', () => {
  it('asks to start, sums navigated rides and learns from the refill', () => {
    let s = recordRide(DEFAULT_LEARN_STATE, 'combustion', ride(10, 0, 0.2));
    expect(promptAfterRide(s, 'combustion', ride(10, 0, 0.2), opts)).toBe('fuel-start');
    s = startFuelWindow(s, T0);
    for (let i = 0; i < 4; i++) s = recordRide(s, 'combustion', ride(10, 0, 0.2));
    expect(s.fuel).toEqual({ since: T0, km: 40, modelled: expect.closeTo(0.8, 6) });
    expect(promptAfterRide(s, 'combustion', ride(10, 0, 0.2), opts)).toBe('fuel-ride');
    const r = submitFill(s, 1.2, T0 + DAY);
    expect(r.outcome).toBe('saved');
    expect(learnedFactor(r.state)).toBeCloseTo(1.5);
    // still learning: the full tank starts the next measurement
    expect(r.state.fuel).toEqual({ since: T0 + DAY, km: 0, modelled: 0 });
  });

  it('a too short window is not saved but restarts', () => {
    let s = startFuelWindow(DEFAULT_LEARN_STATE, T0);
    s = recordRide(s, 'combustion', ride(10, 0, 0.2));
    const r = submitFill(s, 0.3, T0 + 1);
    expect(r.outcome).toBe('too-short');
    expect(r.state.samples).toHaveLength(0);
    expect(r.state.fuel).toEqual({ since: T0 + 1, km: 0, modelled: 0 });
    expect(submitFill(DEFAULT_LEARN_STATE, 1, T0).outcome).toBe('invalid'); // no measurement open
  });

  it('skipping a ride drops the open measurement', () => {
    const s = startFuelWindow(DEFAULT_LEARN_STATE, T0);
    expect(skipRide(s, 'combustion').fuel).toBeNull();
  });

  it('stops measuring once the target is reached', () => {
    let s = startFuelWindow(DEFAULT_LEARN_STATE, T0);
    for (let i = 0; i < cfg.LEARN_SAMPLES_TARGET; i++) {
      s = recordRide(s, 'combustion', ride(40, 0, 0.8));
      s = submitFill(s, 1.0, T0 + i).state;
    }
    expect(s.samples).toHaveLength(cfg.LEARN_SAMPLES_TARGET);
    expect(s.fuel).toBeNull();
    s = recordRide(s, 'combustion', ride(10, 0, 0.2));
    expect(promptAfterRide(s, 'combustion', ride(10, 0, 0.2), { ...opts, now: T0 + DAY })).toBe('none');
  });
});

describe('range uses the learned factor', () => {
  const manual = { ...DEFAULT_ENERGY_SETTINGS, capacity: 1500, realConsumption: referenceConsumption(EL) * 2 };

  it('without manual value from the first sample, otherwise once trusted', () => {
    const one = learnedBattery(1);
    expect(calibrationFactor(EL, DEFAULT_ENERGY_SETTINGS, one)).toBeCloseTo(1.5);
    expect(calibrationFactor(EL, manual, one)).toBeCloseTo(2);
    expect(calibrationFactor(EL, manual, learnedBattery(cfg.LEARN_TRUST_SAMPLES))).toBeCloseTo(1.5);
    const est = estimateRange(EL, manual, { distanceM: 10_000, energyWh: 300, fuelL: 0 }, learnedBattery(3));
    expect(est.used).toBeCloseTo(450);
  });
});

describe('ride meter', () => {
  it('books the ridden share of each route, reroutes included', () => {
    const m = new RideMeter();
    m.setRoute({ distanceM: 10_000, energyWh: 300, fuelL: 0.2 });
    m.progress(4000);
    m.progress(3000); // never goes back
    m.setRoute({ distanceM: 8000, energyWh: 200, fuelL: 0.1 }); // reroute after 4 km
    m.progress(2000);
    expect(m.total()).toEqual({ km: 6, energyWh: expect.closeTo(170, 6), fuelL: expect.closeTo(0.105, 6) });
    m.progress(7900, true); // arrived: whole route
    const t = m.total();
    expect(t.km).toBeCloseTo(12);
    expect(t.energyWh).toBeCloseTo(320);
    expect(new RideMeter().total()).toEqual({ km: 0, energyWh: 0, fuelL: 0 });
  });
});

describe('storage and input', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it('round-trips per drive and sanitises', () => {
    const st = mem();
    const s = startFuelWindow(learnedBattery(2), T0);
    saveLearnState(st, 'electric', s);
    expect(loadLearnState(st, 'electric')).toEqual(s);
    expect(loadLearnState(st, 'combustion')).toEqual(DEFAULT_LEARN_STATE);
    st.setItem(learnStorageKey('electric'), '{"samples":[{"at":1,"km":2,"modelled":-1,"real":3},"x"],"optOut":"yes","fuel":{}}');
    expect(loadLearnState(st, 'electric')).toEqual(DEFAULT_LEARN_STATE);
    st.setItem(learnStorageKey('electric'), '{broken');
    expect(loadLearnState(st, 'electric')).toEqual(DEFAULT_LEARN_STATE);
    expect(loadLearnState(null, 'electric')).toEqual(DEFAULT_LEARN_STATE);
  });

  it('parses battery percentages', () => {
    expect(parsePercent('80')).toBe(80);
    expect(parsePercent(' 42,5 % ')).toBe(42.5);
    expect(parsePercent('')).toBeNull();
    expect(parsePercent('101')).toBeNull();
    expect(parsePercent('-1')).toBeNull();
  });
});
