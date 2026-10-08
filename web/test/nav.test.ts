import { describe, expect, it } from 'vitest';
import { maneuvers, nextManeuver, turnKind } from '../src/nav/maneuvers';
import { buildTrack, locate, OffRouteDetector } from '../src/nav/progress';
import type { LatLon } from '../src/router/protocol';

// ~1 m = 1/111195 deg latitude; at the equator the same for longitude.
const M = 1 / 111_195;
/** L-shaped route: 200 m east (2 edges of 100 m, 36 km/h), then 200 m north (1 edge, 18 km/h). */
const geometry: LatLon[] = [[0, 0], [0, 100 * M], [0, 200 * M], [100 * M, 200 * M], [200 * M, 200 * M]];
const track = buildTrack(geometry, { geomIndex: [0, 1, 2, 4], speedKmh: [36, 36, 18] });

describe('route progress', () => {
  it('builds cumulative distance, edges per segment and travel time', () => {
    expect(track.cum[4]).toBeCloseTo(400, 0);
    expect(track.segEdge).toEqual([0, 1, 2, 2]);
    expect(track.edgeTimeCum.map((x) => Math.round(x))).toEqual([0, 10, 20, 60]);
  });

  it('projects a fix onto the line: along, offset, remaining distance and time', () => {
    const p = locate(track, { lat: 10 * M, lon: 150 * M, accuracy: 5 });
    expect(p.alongM).toBeCloseTo(150, 0);
    expect(p.offsetM).toBeCloseTo(10, 0);
    expect(p.edge).toBe(1);
    expect(p.remainingM).toBeCloseTo(250, 0);
    expect(p.remainingTimeShare).toBeCloseTo(45 / 60, 2);
    expect(p.arrived).toBe(false);
    expect(locate(track, { lat: 195 * M, lon: 200 * M, accuracy: 5 }).arrived).toBe(true);
  });

  it('prefers the part of the route ahead of the last progress', () => {
    // a point equally close to both legs of the L: with progress 250 m it belongs to the second leg
    const p = locate(track, { lat: 20 * M, lon: 180 * M, accuracy: 5 }, 250);
    expect(p.alongM).toBeGreaterThan(200);
  });

  it('reports off-route after consecutive far fixes, tolerant to bad accuracy', () => {
    const det = new OffRouteDetector();
    const far = { lat: -80 * M, lon: 100 * M, accuracy: 10 };
    const p = locate(track, far);
    expect(det.update(p, far)).toBe(false);
    expect(det.update(p, far)).toBe(false);
    expect(det.update(p, far)).toBe(true);
    const fuzzy = { ...far, accuracy: 120 };
    det.reset();
    for (let i = 0; i < 5; i++) expect(det.update(p, fuzzy)).toBe(false);
  });
});

describe('maneuvers', () => {
  it('finds the left turn at the corner and the arrival', () => {
    const list = maneuvers(track);
    expect(list.map((m) => m.kind)).toEqual(['left', 'arrive']);
    expect(list[0]!.atM).toBeCloseTo(200, 0);
    expect(nextManeuver(list, 50).kind).toBe('left');
    expect(nextManeuver(list, 250).kind).toBe('arrive');
  });

  it('classifies turn angles', () => {
    expect(turnKind(10)).toBeNull();
    expect(turnKind(-45)).toBe('slight-left');
    expect(turnKind(90)).toBe('right');
    expect(turnKind(-150)).toBe('sharp-left');
  });
});

describe('nav text', async () => {
  const { etaClock, navDistance } = await import('../src/nav/format');
  it('formats distances and arrival time', () => {
    expect(navDistance('de', 247)).toBe('250 m');
    expect(navDistance('de', 4)).toBe('0 m');
    expect(navDistance('de', 1240)).toBe('1,2 km');
    expect(navDistance('en', 12_600)).toBe('13 km');
    expect(etaClock(new Date(2026, 9, 8, 14, 20), 12 * 60 + 5)).toBe('14:32');
  });
});
