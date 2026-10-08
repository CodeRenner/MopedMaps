import { describe, expect, it } from 'vitest';
import {
  addRecent, clearFavourite, EMPTY_PLACES, loadPlaces, PLACES_STORAGE_KEY, RECENT_MAX, savePlaces, setFavourite,
} from '../src/ui/placesStore';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('places', () => {
  it('keeps recent destinations newest first, deduplicated and capped', () => {
    let p = EMPTY_PLACES;
    p = addRecent(p, [48.0, 7.85], 'A', 1);
    p = addRecent(p, [48.1, 7.85], 'B', 2);
    p = addRecent(p, [48.0002, 7.8501], 'A again', 3); // ~25 m from A
    expect(p.recent.map((r) => r.label)).toEqual(['A again', 'B']);
    for (let i = 0; i < 20; i++) p = addRecent(p, [47 + i * 0.01, 8], `P${i}`, 10 + i);
    expect(p.recent).toHaveLength(RECENT_MAX);
    expect(p.recent[0]!.label).toBe('P19');
  });

  it('sets and clears favourites, and survives storage', () => {
    const st = mem();
    let p = setFavourite(EMPTY_PLACES, 'home', [48.0079, 7.8509], '79098 Freiburg', 5);
    p = addRecent(p, [48.1253, 7.8558], '79312 Emmendingen', 6);
    savePlaces(st, p);
    expect(loadPlaces(st)).toEqual(p);
    expect(clearFavourite(p, 'home').home).toBeNull();
    st.setItem(PLACES_STORAGE_KEY, '{"recent":[{"lat":"x"}],"home":{"lat":200,"lon":0,"label":"bad","ts":1}}');
    expect(loadPlaces(st)).toEqual(EMPTY_PLACES);
    st.setItem(PLACES_STORAGE_KEY, '{broken');
    expect(loadPlaces(st)).toEqual(EMPTY_PLACES);
  });
});
