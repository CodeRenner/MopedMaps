import { describe, expect, it } from 'vitest';
import { AREA_STORAGE_KEY, loadLastArea, saveLastArea } from '../src/ui/areaStore';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('last area', () => {
  it('round-trips and sanitises', () => {
    const st = mem();
    expect(loadLastArea(st)).toBeNull();
    saveLastArea(st, { plz: '79098', radiusKm: 50 });
    expect(loadLastArea(st)).toEqual({ plz: '79098', radiusKm: 50 });
    st.setItem(AREA_STORAGE_KEY, '{"plz":"79098","radiusKm":999}');
    expect(loadLastArea(st)).toEqual({ plz: '79098', radiusKm: 100 });
    st.setItem(AREA_STORAGE_KEY, '{"plz":"Freiburg","radiusKm":50}');
    expect(loadLastArea(st)).toBeNull();
    st.setItem(AREA_STORAGE_KEY, '{broken');
    expect(loadLastArea(st)).toBeNull();
    expect(loadLastArea(null)).toBeNull();
  });
});
