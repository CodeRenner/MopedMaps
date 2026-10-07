import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { fallbackStyle, requestPersistence } from '../src/ui/basemap';

describe('fallback style', () => {
  it('is a valid MapLibre style that needs no network', () => {
    const style = fallbackStyle();
    expect(validateStyleMin(style)).toEqual([]);
    expect(Object.keys(style.sources)).toHaveLength(0);
    expect(style.glyphs).toBeUndefined();
    expect(style.sprite).toBeUndefined();
  });
});

describe('requestPersistence', () => {
  it('handles unsupported, already persisted, granted, denied and throwing APIs', async () => {
    expect(await requestPersistence(undefined)).toBeUndefined();
    expect(await requestPersistence({})).toBeUndefined();
    expect(await requestPersistence({ persisted: async () => true, persist: async () => false })).toBe(true);
    expect(await requestPersistence({ persisted: async () => false, persist: async () => true })).toBe(true);
    expect(await requestPersistence({ persist: async () => false })).toBe(false);
    expect(await requestPersistence({ persist: async () => { throw new Error('nope'); } })).toBeUndefined();
  });
});
