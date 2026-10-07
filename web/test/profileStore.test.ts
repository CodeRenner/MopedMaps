import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../src/router/profile';
import { loadProfile, PROFILE_STORAGE_KEY, parseVmax, saveProfile } from '../src/ui/profileStore';

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('parseVmax', () => {
  it.each([
    ['45', 45], [' 25 ', 25], ['45,5', 46], ['100', 100], ['6', 6],
    ['5', null], ['201', null], ['abc', null], ['', null],
  ])('%s -> %s', (input, want) => expect(parseVmax(input)).toBe(want));
});

describe('profile storage', () => {
  it('round-trips', () => {
    const s = mem();
    saveProfile(s, { vmaxKmh: 25, drive: 'electric' });
    expect(loadProfile(s)).toEqual({ vmaxKmh: 25, drive: 'electric' });
  });

  it('falls back to defaults for missing, corrupt or invalid data', () => {
    expect(loadProfile(null)).toEqual(DEFAULT_PROFILE);
    const s = mem();
    expect(loadProfile(s)).toEqual(DEFAULT_PROFILE);
    s.m.set(PROFILE_STORAGE_KEY, '{not json');
    expect(loadProfile(s)).toEqual(DEFAULT_PROFILE);
    s.m.set(PROFILE_STORAGE_KEY, JSON.stringify({ vmaxKmh: 999, drive: 'diesel' }));
    expect(loadProfile(s)).toEqual(DEFAULT_PROFILE);
    s.m.set(PROFILE_STORAGE_KEY, JSON.stringify({ vmaxKmh: 30 }));
    expect(loadProfile(s)).toEqual({ vmaxKmh: 30, drive: DEFAULT_PROFILE.drive });
  });

  it('ignores storage errors', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(loadProfile(broken)).toEqual(DEFAULT_PROFILE);
    expect(() => saveProfile(broken, DEFAULT_PROFILE)).not.toThrow();
  });
});
