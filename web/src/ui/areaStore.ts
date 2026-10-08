/** Remember the last loaded area so the app reopens it on start (chunks are cached in IndexedDB). */

import { clampRadius } from '../data/area';
import type { KeyValueStorage } from './profileStore';

export const AREA_STORAGE_KEY = 'mopedmaps.area.v1';

export interface LastArea {
  plz: string;
  radiusKm: number;
}

export function loadLastArea(storage: KeyValueStorage | null): LastArea | null {
  try {
    const raw = storage?.getItem(AREA_STORAGE_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Partial<LastArea>;
    if (typeof a.plz !== 'string' || !/^\d{5}$/.test(a.plz)) return null;
    return { plz: a.plz, radiusKm: clampRadius(Number(a.radiusKm)) };
  } catch {
    return null;
  }
}

export function saveLastArea(storage: KeyValueStorage | null, a: LastArea): void {
  try {
    storage?.setItem(AREA_STORAGE_KEY, JSON.stringify(a));
  } catch {
    // storage blocked: the user simply types the PLZ again next time
  }
}
