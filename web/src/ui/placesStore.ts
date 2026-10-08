/**
 * Recent destinations and favourites (home, work), stored on the device only.
 * Pure (storage injected) so it can be tested.
 */

import { haversineM } from '../router/geo';
import type { LatLon } from '../router/protocol';
import type { KeyValueStorage } from './profileStore';

export const PLACES_STORAGE_KEY = 'mopedmaps.places.v1';
/** Number of recent destinations kept. */
export const RECENT_MAX = 8;
/** A new destination within this distance replaces the old entry (moves it to the top). */
export const SAME_PLACE_M = 75;

export interface Place {
  lat: number;
  lon: number;
  /** Coarse label, e.g. "79098 Freiburg im Breisgau". */
  label: string;
  /** Last used, ms since epoch. */
  ts: number;
}

export type FavouriteKey = 'home' | 'work';

export interface Places {
  recent: Place[];
  home: Place | null;
  work: Place | null;
}

export const EMPTY_PLACES: Places = { recent: [], home: null, work: null };

const isPlace = (p: unknown): p is Place => {
  const x = p as Partial<Place> | null;
  return (
    !!x &&
    typeof x.lat === 'number' && Math.abs(x.lat) <= 90 &&
    typeof x.lon === 'number' && Math.abs(x.lon) <= 180 &&
    typeof x.label === 'string' &&
    typeof x.ts === 'number'
  );
};

export function loadPlaces(storage: KeyValueStorage | null): Places {
  try {
    const raw = storage?.getItem(PLACES_STORAGE_KEY);
    if (!raw) return EMPTY_PLACES;
    const p = JSON.parse(raw) as Partial<Places>;
    return {
      recent: Array.isArray(p.recent) ? p.recent.filter(isPlace).slice(0, RECENT_MAX) : [],
      home: isPlace(p.home) ? p.home : null,
      work: isPlace(p.work) ? p.work : null,
    };
  } catch {
    return EMPTY_PLACES;
  }
}

export function savePlaces(storage: KeyValueStorage | null, p: Places): void {
  try {
    storage?.setItem(PLACES_STORAGE_KEY, JSON.stringify(p));
  } catch {
    // storage blocked: places only live for this session
  }
}

const near = (a: Place, b: LatLon) => haversineM(a.lat, a.lon, b[0], b[1]) <= SAME_PLACE_M;

/** Put a destination on top of the recent list (deduplicated, capped). */
export function addRecent(p: Places, at: LatLon, label: string, now: number): Places {
  const entry: Place = { lat: at[0], lon: at[1], label, ts: now };
  return { ...p, recent: [entry, ...p.recent.filter((r) => !near(r, at))].slice(0, RECENT_MAX) };
}

export function setFavourite(p: Places, key: FavouriteKey, at: LatLon, label: string, now: number): Places {
  return { ...p, [key]: { lat: at[0], lon: at[1], label, ts: now } };
}

export function clearFavourite(p: Places, key: FavouriteKey): Places {
  return { ...p, [key]: null };
}
