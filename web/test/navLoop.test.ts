import { describe, expect, it } from 'vitest';
import { NAV_LOCATE_AHEAD_M, NAV_LOCATE_MAX_SPEED_MPS } from '../src/config';
import { buildTrack, locate, OffRouteDetector } from '../src/nav/progress';
import type { LatLon } from '../src/router/protocol';

// Local metric frame near 50°N: x east, y north in metres.
const LAT0 = 50;
const M_LAT = 1 / 111_195;
const M_LON = 1 / (111_195 * Math.cos((LAT0 * Math.PI) / 180));
const ll = (x: number, y: number): LatLon => [LAT0 + y * M_LAT, 8 + x * M_LON];

/**
 * A ramp loop that crosses itself: north under a bridge at the origin, a
 * 270° loop to the east, then west over the bridge. The route passes the
 * origin twice: at 300 m (below) and again ~670 m later (on the bridge).
 */
function loopRoute(): { pts: [number, number][]; geometry: LatLon[] } {
  const pts: [number, number][] = [];
  for (let y = -300; y <= 0; y += 10) pts.push([0, y]); // north, under the bridge at y=0
  const cx = 100, cy = 0, r = 100; // 270° clockwise loop around (100, 0), ends at (100, -100)
  for (let a = 180; a >= -90; a -= 10) {
    const rad = (a * Math.PI) / 180;
    pts.push([cx + r * Math.cos(rad), cy + r * Math.sin(rad)]);
  }
  for (let y = -90; y <= 0; y += 10) pts.push([100, y]); // back north to the bridge line

  for (let x = 90; x >= -300; x -= 10) pts.push([x, 0]);
  return { pts, geometry: pts.map(([x, y]) => ll(x, y)) };
}

describe('navigation on a route that crosses itself', () => {
  it('does not jump to the later pass when riding under the bridge', () => {
    const { pts, geometry } = loopRoute();
    const track = buildTrack(geometry, { geomIndex: [0, geometry.length - 1], speedKmh: [40] });
    const off = new OffRouteDetector();
    let along = 0;
    let worst = 0;
    let rerouted = false;
    // Ride the route in 10 m steps; GPS 3 m to the east (towards the later westbound pass).
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i]!;
      const fix = { lat: ll(x + 3, y)[0], lon: ll(x + 3, y)[1], accuracy: 5 };
      const p = locate(track, fix, along, NAV_LOCATE_AHEAD_M + NAV_LOCATE_MAX_SPEED_MPS); // one fix per second
      along = p.alongM;
      worst = Math.max(worst, Math.abs(p.alongM - track.cum[i]!));
      if (off.update(p, fix)) rerouted = true;
    }
    expect(worst).toBeLessThan(15);
    expect(rerouted).toBe(false);
  });

  it('still follows a rider after a long GPS gap (window grows with time)', () => {
    const { geometry } = loopRoute();
    const track = buildTrack(geometry, { geomIndex: [0, geometry.length - 1], speedKmh: [40] });
    const [lat, lon] = ll(-200, 0); // far along, on the final westbound leg
    const truth = track.cum[track.cum.length - 1]! - 100;
    const p = locate(track, { lat, lon, accuracy: 5 }, 100, NAV_LOCATE_AHEAD_M + 60 * NAV_LOCATE_MAX_SPEED_MPS);
    expect(Math.abs(p.alongM - truth)).toBeLessThan(5);
  });
});
