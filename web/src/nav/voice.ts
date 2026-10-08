/**
 * Voice guidance: decides *what* to say and *when* (pure, testable); the
 * speaking itself uses the device's speech synthesis (offline, free).
 *
 * Per turn: an early announcement ("In 300 Metern links abbiegen") and a
 * "now" announcement shortly before it; each at most once. Arrival and
 * reroutes are announced once.
 */

import { VOICE_EARLY_M, VOICE_EARLY_S, VOICE_NOW_M, VOICE_NOW_S } from '../config';
import type { Maneuver } from './maneuvers';

export type Speech =
  | { key: 'voice.early'; dist: number; turn: Maneuver['kind'] }
  | { key: 'voice.now'; turn: Maneuver['kind'] }
  | { key: 'voice.arrived' }
  | { key: 'voice.rerouted' }
  | { key: 'voice.start' };

/** Round a distance for speech: 50 m steps below 1 km, else 100 m steps. */
export function speechDistance(m: number): number {
  return m < 1000 ? Math.max(50, Math.round(m / 50) * 50) : Math.round(m / 100) * 100;
}

export class Announcer {
  private early = new Set<number>();
  private now = new Set<number>();
  private arrived = false;

  /** Call on every position fix. `speedMps` may be 0 when unknown. */
  update(m: Maneuver, distM: number, speedMps: number, arrived: boolean): Speech | null {
    if (arrived) {
      if (this.arrived) return null;
      this.arrived = true;
      return { key: 'voice.arrived' };
    }
    if (m.kind === 'arrive') return null; // final approach: the arrival itself is announced
    const id = Math.round(m.atM);
    const nowAt = Math.max(VOICE_NOW_M, speedMps * VOICE_NOW_S);
    const earlyAt = Math.max(VOICE_EARLY_M, speedMps * VOICE_EARLY_S);
    if (distM <= nowAt) {
      if (this.now.has(id)) return null;
      this.now.add(id);
      this.early.add(id); // too late for the early one
      return { key: 'voice.now', turn: m.kind };
    }
    if (distM <= earlyAt && !this.early.has(id)) {
      this.early.add(id);
      return { key: 'voice.early', dist: speechDistance(distM), turn: m.kind };
    }
    return null;
  }

  /** After a reroute the maneuver positions change: start over (arrival stays announced). */
  reset(): void {
    this.early.clear();
    this.now.clear();
  }

  /** New navigation: forget everything. */
  restart(): void {
    this.reset();
    this.arrived = false;
  }
}
