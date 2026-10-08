import { describe, expect, it } from 'vitest';
import type { Maneuver } from '../src/nav/maneuvers';
import { Announcer, speechDistance } from '../src/nav/voice';

const left: Maneuver = { atM: 1000, kind: 'left', angle: -90 };
const arrive: Maneuver = { atM: 2000, kind: 'arrive', angle: 0 };

describe('voice guidance', () => {
  it('announces a turn early and "now", each once', () => {
    const a = new Announcer();
    expect(a.update(left, 600, 8, false)).toBeNull();
    expect(a.update(left, 290, 8, false)).toEqual({ key: 'voice.early', dist: 300, turn: 'left' });
    expect(a.update(left, 250, 8, false)).toBeNull();
    expect(a.update(left, 35, 8, false)).toEqual({ key: 'voice.now', turn: 'left' });
    expect(a.update(left, 10, 8, false)).toBeNull();
  });

  it('announces earlier when fast and skips the early one if already close', () => {
    const fast = new Announcer();
    expect(fast.update(left, 380, 20, false)).toMatchObject({ key: 'voice.early', dist: 400 }); // 20 m/s × 20 s
    const late = new Announcer();
    expect(late.update(left, 30, 5, false)).toEqual({ key: 'voice.now', turn: 'left' });
    expect(late.update(left, 20, 5, false)).toBeNull();
  });

  it('announces arrival once and nothing for the final approach', () => {
    const a = new Announcer();
    expect(a.update(arrive, 100, 5, false)).toBeNull();
    expect(a.update(arrive, 10, 5, true)).toEqual({ key: 'voice.arrived' });
    expect(a.update(arrive, 5, 5, true)).toBeNull();
  });

  it('a new navigation can announce arrival again', () => {
    const a = new Announcer();
    a.update(arrive, 5, 0, true);
    a.restart();
    expect(a.update(arrive, 5, 0, true)).toEqual({ key: 'voice.arrived' });
  });

  it('starts over after a reroute', () => {
    const a = new Announcer();
    a.update(left, 200, 8, false);
    a.reset();
    expect(a.update(left, 200, 8, false)).toMatchObject({ key: 'voice.early' });
  });

  it('rounds distances for speech', () => {
    expect(speechDistance(287)).toBe(300);
    expect(speechDistance(20)).toBe(50);
    expect(speechDistance(1240)).toBe(1200);
  });
});
