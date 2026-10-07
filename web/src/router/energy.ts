/**
 * Simple energy model per edge (roadmap step 6). Pure. Constants in config;
 * documented in docs/energy-model.md.
 *
 * Wheel energy = lifting the vehicle over the ascent + re-accelerating after
 * each traffic signal + rolling/aerodynamic losses, where the potential
 * energy released on the descent can offset (only) those losses — anything
 * beyond is braked away (combustion) or partly recovered (electric regen).
 * Always >= 0, so routing costs stay non-negative (needed for A-star).
 */

import * as cfg from '../config';
import type { ChunkEdge } from './chunk';
import { speedKmh, type VehicleProfile } from './profile';

const J_PER_WH = 3600;

export interface EdgeEnergy {
  /** Mechanical energy at the wheel (Wh), >= 0. Used for routing cost. */
  wheelWh: number;
  /** Electric: battery energy drawn (Wh). Combustion: fuel energy (Wh). */
  sourceWh: number;
  /** Combustion only: petrol in litres (0 for electric). */
  fuelL: number;
}

export function edgeEnergy(e: ChunkEdge, forward: boolean, p: VehicleProfile): EdgeEnergy {
  const m = cfg.ENERGY_MASS_KG;
  const g = cfg.GRAVITY;
  const v = speedKmh(e, forward, p) / 3.6;
  const up = forward ? e.ascentM : e.descentM;
  const down = forward ? e.descentM : e.ascentM;

  const resist = (cfg.ENERGY_CRR * m * g + 0.5 * cfg.AIR_DENSITY * cfg.ENERGY_CDA_M2 * v * v) * e.lengthM;
  const accel = e.signals * 0.5 * m * v * v;
  const lift = m * g * up;
  const release = m * g * down;

  const losses = Math.max(0, resist - release);
  if (p.drive === 'electric') {
    // Braking before signals and surplus descent energy are partly recovered.
    const drawJ = lift + losses + accel * (1 - cfg.ELECTRIC_REGEN_SHARE);
    const recoveredJ = Math.max(0, release - resist) * cfg.ELECTRIC_REGEN_SHARE;
    const wheelWh = drawJ / J_PER_WH;
    const sourceWh =
      Math.max(0, drawJ / cfg.ELECTRIC_EFFICIENCY - recoveredJ * cfg.ELECTRIC_EFFICIENCY) / J_PER_WH;
    return { wheelWh, sourceWh, fuelL: 0 };
  }
  const wheelJ = lift + losses + accel;
  const wheelWh = wheelJ / J_PER_WH;
  const idleL = (e.signals * cfg.IDLE_S_PER_SIGNAL * cfg.COMBUSTION_IDLE_L_PER_H) / 3600;
  const fuelL = wheelWh / cfg.COMBUSTION_EFFICIENCY / cfg.PETROL_WH_PER_L + idleL;
  return { wheelWh, sourceWh: fuelL * cfg.PETROL_WH_PER_L, fuelL };
}
