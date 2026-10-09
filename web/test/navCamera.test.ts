import { describe, expect, it } from 'vitest';
import { blendPose, poseDistM, turnDelta } from '../src/nav/camera';
import { bearingAt, buildTrack, pointAt, remainingGeometry } from '../src/nav/progress';
import type { LatLon } from '../src/router/protocol';

describe('follow camera maths', () => {
  it('turns the short way round', () => {
    expect(turnDelta(350, 10)).toBe(20);
    expect(turnDelta(10, 350)).toBe(-20);
    expect(turnDelta(0, 180)).toBe(180);
    expect(blendPose({ lat: 0, lon: 0, bearing: 350 }, { lat: 1, lon: 2, bearing: 10 }, 0.5)).toEqual({
      lat: 0.5, lon: 1, bearing: 0,
    });
    expect(blendPose({ lat: 0, lon: 0, bearing: 0 }, { lat: 1, lon: 1, bearing: 90 }, 2).lat).toBe(1); // clamped
    expect(poseDistM({ lat: 48, lon: 7.8, bearing: 0 }, { lat: 48.001, lon: 7.8, bearing: 0 })).toBeCloseTo(111, 0);
  });
});

describe('route position helpers', () => {
  // ~111 m north, then ~74 m east (at 48°)
  const g: LatLon[] = [[48, 7.8], [48.001, 7.8], [48.001, 7.801]];
  const t = buildTrack(g, { geomIndex: [0, 1, 2], speedKmh: [30, 30] });

  it('finds the point at a distance along the route', () => {
    const a = pointAt(t, 55.6);
    expect(a.seg).toBe(0);
    expect(a.point[0]).toBeCloseTo(48.0005, 4);
    expect(pointAt(t, 1e6).point).toEqual([48.001, 7.801]); // clamped to the end
    expect(pointAt(t, -5).point).toEqual([48, 7.8]);
  });

  it('cuts off the part already ridden', () => {
    const r = remainingGeometry(t, 55.6);
    expect(r).toHaveLength(3);
    expect(r[0]![0]).toBeCloseTo(48.0005, 4);
    expect(remainingGeometry(t, 150)).toHaveLength(2);
  });

  it('heads along the road ahead', () => {
    expect(bearingAt(t, 10)).toBeCloseTo(0, 0); // north
    expect(bearingAt(t, 140)).toBeCloseTo(90, 0); // east
  });
});
