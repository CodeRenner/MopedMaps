/** Load/save the vehicle profile. Storage is injected so this stays pure/testable. */

import { MAX_VMAX_KMH, MIN_VMAX_KMH } from '../config';
import { DEFAULT_PROFILE, type Drive, type VehicleProfile } from '../router/profile';

export const PROFILE_STORAGE_KEY = 'mopedmaps.profile.v1';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Parse user vmax input ("45", "45,5", " 30 "); null if invalid or out of range. */
export function parseVmax(input: string): number | null {
  const n = Number(input.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < MIN_VMAX_KMH || n > MAX_VMAX_KMH) return null;
  return Math.round(n);
}

function isDrive(x: unknown): x is Drive {
  return x === 'electric' || x === 'combustion';
}

export function loadProfile(storage: KeyValueStorage | null): VehicleProfile {
  try {
    const raw = storage?.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const p = JSON.parse(raw) as Partial<VehicleProfile>;
    const vmax = typeof p.vmaxKmh === 'number' ? parseVmax(String(p.vmaxKmh)) : null;
    return {
      vmaxKmh: vmax ?? DEFAULT_PROFILE.vmaxKmh,
      drive: isDrive(p.drive) ? p.drive : DEFAULT_PROFILE.drive,
    };
  } catch {
    return DEFAULT_PROFILE; // corrupt JSON or storage blocked
  }
}

export function saveProfile(storage: KeyValueStorage | null, p: VehicleProfile): void {
  try {
    storage?.setItem(PROFILE_STORAGE_KEY, JSON.stringify(p));
  } catch {
    // storage full or blocked (private mode): keep the in-memory profile
  }
}
