/**
 * Vehicle profile, access rules and edge cost. Pure functions, no DOM.
 *
 * cost = a*time + b*risk + c*energy (CLAUDE.md). Risk (roadmap step 5) and
 * energy (step 6) are not modelled yet and contribute 0.
 */

import * as cfg from '../config';
import { AccessFlag, type ChunkEdge, RoadClass } from './chunk';

export type Drive = 'electric' | 'combustion';

export interface VehicleProfile {
  vmaxKmh: number;
  drive: Drive;
}

export interface CostWeights {
  time: number; // a
  risk: number; // b
  energy: number; // c
}

export const DEFAULT_PROFILE: VehicleProfile = { vmaxKmh: cfg.DEFAULT_VMAX_KMH, drive: 'combustion' };
export const DEFAULT_WEIGHTS: CostWeights = { time: 1, risk: 0, energy: 0 };

export function validateProfile(p: VehicleProfile): VehicleProfile {
  if (!Number.isFinite(p.vmaxKmh) || p.vmaxKmh < cfg.MIN_VMAX_KMH || p.vmaxKmh > cfg.MAX_VMAX_KMH) {
    throw new RangeError(`vmax must be ${cfg.MIN_VMAX_KMH}..${cfg.MAX_VMAX_KMH} km/h`);
  }
  return p;
}

/** Whether the vehicle may use the edge at all (direction is handled by arcs). */
export function canUse(e: ChunkEdge, p: VehicleProfile): boolean {
  const needed = p.vmaxKmh <= cfg.MOFA_MAX_VMAX_KMH ? AccessFlag.MOFA : AccessFlag.MOPED;
  if ((e.flags & needed) === 0) return false;
  if (p.vmaxKmh < cfg.MOTORWAY_MIN_VMAX_KMH) {
    if (e.roadClass === RoadClass.MOTORWAY) return false;
    if ((e.flags & AccessFlag.MOTORROAD) !== 0) return false;
  }
  return true;
}

/** Effective speed in km/h for one direction: min(limit, vmax) × surface. */
export function speedKmh(e: ChunkEdge, forward: boolean, p: VehicleProfile): number {
  const raw = forward ? e.maxspeedFwd : e.maxspeedBwd;
  const limit = raw ?? cfg.DEFAULT_SPEED_BY_CLASS_KMH[e.roadClass] ?? 50;
  return Math.min(limit, p.vmaxKmh) * (cfg.SURFACE_SPEED_FACTOR[e.surface] ?? 1);
}

/** Travel time in seconds including penalties. */
export function travelTimeS(e: ChunkEdge, forward: boolean, p: VehicleProfile): number {
  const v = speedKmh(e, forward, p) / 3.6;
  return (
    e.lengthM / v +
    e.signals * cfg.SIGNAL_PENALTY_S +
    cfg.JUNCTION_PENALTY_S +
    e.curvatureDeg * cfg.CURVATURE_PENALTY_S_PER_DEG
  );
}

/** Generalised edge cost; Infinity if the vehicle may not use the edge. */
export function edgeCost(
  e: ChunkEdge,
  forward: boolean,
  p: VehicleProfile,
  w: CostWeights = DEFAULT_WEIGHTS,
): number {
  if (!canUse(e, p)) return Infinity;
  let time = travelTimeS(e, forward, p);
  if ((e.flags & AccessFlag.DESTINATION) !== 0) time += cfg.DESTINATION_PENALTY_S;
  return w.time * time; // + w.risk * risk + w.energy * energy (steps 5/6)
}
