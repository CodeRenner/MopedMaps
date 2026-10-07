/**
 * Range estimate from battery/tank capacity and optional real consumption.
 * Pure; documented in docs/energy-model.md ("Range").
 *
 * The energy model gives a modelled consumption for a route. If the user
 * enters a real average consumption, the model is scaled by
 *   k = real / modelled consumption on a reference trip
 * (flat, no signals, RANGE_REFERENCE_SPEED_KMH capped at vmax), so the
 * route's relative effects (hills, speed, signals) are kept while the
 * absolute level matches the user's vehicle.
 */

import * as cfg from '../config';
import { AccessFlag, RoadClass, Surface } from './chunk';
import { edgeEnergy } from './energy';
import type { VehicleProfile } from './profile';

export interface EnergySettings {
  /** Usable battery capacity (Wh, electric) or tank size (l, combustion); null = unknown. */
  capacity: number | null;
  /** Real average consumption: Wh/km (electric) or l/100 km (combustion); null = use the model. */
  realConsumption: number | null;
  /** Warn when less than this share is left after the trip (0..1). */
  reserveShare: number;
}

export const DEFAULT_ENERGY_SETTINGS: EnergySettings = {
  capacity: null,
  realConsumption: null,
  reserveShare: cfg.RANGE_RESERVE_SHARE,
};

/** Modelled consumption on the reference trip: Wh/km (electric) or l/100 km (combustion). */
export function referenceConsumption(p: VehicleProfile): number {
  const speed = Math.min(cfg.RANGE_REFERENCE_SPEED_KMH, p.vmaxKmh);
  const e = edgeEnergy(
    {
      fromIdx: 0, toIdx: 1, toTile: [0, 0], roadClass: RoadClass.TERTIARY,
      flags: AccessFlag.MOPED | AccessFlag.MOFA, maxspeedFwd: speed, maxspeedBwd: speed,
      surface: Surface.PAVED, lit: null, cycleway: false, signals: 0, lengthM: 1000,
      curvatureDeg: 0, ascentM: 0, descentM: 0, risk: 0, shape: [],
    },
    true,
    p,
  );
  return p.drive === 'electric' ? e.sourceWh : e.fuelL * 100;
}

/** Scale factor real/modelled, clamped; 1 without (valid) real consumption. */
export function calibrationFactor(p: VehicleProfile, s: EnergySettings): number {
  const real = s.realConsumption;
  if (real === null || !(real > 0)) return 1;
  const k = real / referenceConsumption(p);
  return Math.min(cfg.RANGE_CALIBRATION_MAX, Math.max(cfg.RANGE_CALIBRATION_MIN, k));
}

export interface RangeEstimate {
  /** Calibrated energy for the route: Wh (electric) or litres (combustion). */
  used: number;
  /** Calibrated consumption on this route: Wh/km or l/100 km. */
  perKmUnit: number;
  /** Only with a capacity (assumes a full battery/tank at the start): */
  usedShare: number | null;
  /** Distance still possible after the trip at this route's consumption (km). */
  remainingKm: number | null;
  /** Less than the reserve left after the trip (or the trip exceeds capacity). */
  belowReserve: boolean;
}

/** Range estimate for a route from the router's modelled energy (Wh) / fuel (l). */
export function estimateRange(
  p: VehicleProfile,
  s: EnergySettings,
  route: { distanceM: number; energyWh: number; fuelL: number },
): RangeEstimate {
  const k = calibrationFactor(p, s);
  const used = (p.drive === 'electric' ? route.energyWh : route.fuelL) * k;
  const km = route.distanceM / 1000;
  const perKm = km > 0 ? used / km : 0;
  const perKmUnit = p.drive === 'electric' ? perKm : perKm * 100;
  const cap = s.capacity;
  if (cap === null || !(cap > 0)) {
    return { used, perKmUnit, usedShare: null, remainingKm: null, belowReserve: false };
  }
  const usedShare = used / cap;
  const left = Math.max(0, cap - used);
  const remainingKm = perKm > 0 ? left / perKm : null;
  return { used, perKmUnit, usedShare, remainingKm, belowReserve: 1 - usedShare < s.reserveShare };
}
