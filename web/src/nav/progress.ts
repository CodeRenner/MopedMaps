/**
 * Position on the route while navigating. Pure: no DOM, no geolocation.
 * Positions are projected onto the route polyline in a local metric frame.
 */

import { NAV_ARRIVAL_M, NAV_OFF_ROUTE_FIXES, NAV_OFF_ROUTE_M } from '../config';
import { haversineM } from '../router/geo';
import type { LatLon } from '../router/protocol';
import type { RouteProfile } from '../router/routeProfile';

export interface RouteTrack {
  geometry: LatLon[];
  /** Cumulative distance (m) at each geometry point. */
  cum: number[];
  /** Edge index for each geometry segment i (geometry[i] -> geometry[i+1]). */
  segEdge: number[];
  /** Cumulative travel time (s) at the start of each edge, plus the total at the end. */
  edgeTimeCum: number[];
  /** Geometry index of each route node (edge e spans geomIndex[e]..geomIndex[e+1]). */
  geomIndex: number[];
}

export function buildTrack(geometry: LatLon[], p: Pick<RouteProfile, 'geomIndex' | 'speedKmh'>): RouteTrack {
  const cum = [0];
  for (let i = 1; i < geometry.length; i++) {
    const [a, b] = [geometry[i - 1]!, geometry[i]!];
    cum.push(cum[i - 1]! + haversineM(a[0], a[1], b[0], b[1]));
  }
  const segEdge: number[] = [];
  const edgeTimeCum = [0];
  for (let e = 0; e < p.speedKmh.length; e++) {
    const from = p.geomIndex[e]!;
    const to = p.geomIndex[e + 1]!;
    for (let i = from; i < to; i++) segEdge[i] = e;
    const len = cum[to]! - cum[from]!;
    edgeTimeCum.push(edgeTimeCum[e]! + len / (p.speedKmh[e]! / 3.6));
  }
  return { geometry, cum, segEdge, edgeTimeCum, geomIndex: p.geomIndex };
}

export interface Fix {
  lat: number;
  lon: number;
  /** GPS accuracy (m), 0 if unknown. */
  accuracy: number;
}

export interface Progress {
  /** Distance travelled along the route (m). */
  alongM: number;
  /** Distance from the route line (m). */
  offsetM: number;
  /** Edge index the position is on. */
  edge: number;
  remainingM: number;
  /** Share of the route's travel time still ahead (0..1). */
  remainingTimeShare: number;
  arrived: boolean;
}

/** Project a fix onto the route. `hintAlongM` (last progress) keeps it from jumping to a parallel/overlapping part. */
export function locate(t: RouteTrack, fix: Fix, hintAlongM = 0): Progress {
  const cosLat = Math.cos((fix.lat * Math.PI) / 180);
  const mPerDegLat = 111_195;
  const mPerDegLon = 111_195 * cosLat;
  let best = { score: Infinity, d: Infinity, along: 0, seg: 0 };
  for (let i = 0; i + 1 < t.geometry.length; i++) {
    const [aLat, aLon] = t.geometry[i]!;
    const [bLat, bLon] = t.geometry[i + 1]!;
    const ax = (aLon - fix.lon) * mPerDegLon, ay = (aLat - fix.lat) * mPerDegLat;
    const bx = (bLon - fix.lon) * mPerDegLon, by = (bLat - fix.lat) * mPerDegLat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const u = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const px = ax + u * dx, py = ay + u * dy;
    const along = t.cum[i]! + u * (t.cum[i + 1]! - t.cum[i]!);
    // Prefer positions not far behind the last known progress (route may overlap itself).
    const d = Math.hypot(px, py);
    const score = d + (along < hintAlongM - 50 ? 200 : 0);
    if (score < best.score) best = { score, d, along, seg: i };
  }
  const total = t.cum[t.cum.length - 1]!;
  const edge = t.segEdge[best.seg] ?? 0;
  const e0 = t.cum[t.geomIndex[edge]!]!;
  const e1 = t.cum[t.geomIndex[edge + 1]!]!;
  const intoEdge = e1 > e0 ? (best.along - e0) / (e1 - e0) : 0;
  const totalTime = t.edgeTimeCum[t.edgeTimeCum.length - 1]!;
  const doneTime = t.edgeTimeCum[edge]! + intoEdge * (t.edgeTimeCum[edge + 1]! - t.edgeTimeCum[edge]!);
  const [tLat, tLon] = t.geometry[t.geometry.length - 1]!;
  return {
    alongM: best.along,
    offsetM: best.d,
    edge,
    remainingM: Math.max(0, total - best.along),
    remainingTimeShare: totalTime > 0 ? Math.max(0, 1 - doneTime / totalTime) : 0,
    arrived: haversineM(fix.lat, fix.lon, tLat, tLon) <= NAV_ARRIVAL_M,
  };
}

/** Counts consecutive off-route fixes; true when a reroute is due. */
export class OffRouteDetector {
  private count = 0;
  update(p: Progress, fix: Fix): boolean {
    const limit = Math.max(NAV_OFF_ROUTE_M, fix.accuracy);
    this.count = p.offsetM > limit ? this.count + 1 : 0;
    return this.count >= NAV_OFF_ROUTE_FIXES;
  }
  reset(): void {
    this.count = 0;
  }
}

/** Segment index and interpolated point at `alongM` (clamped to the route). */
export function pointAt(t: RouteTrack, alongM: number): { seg: number; point: LatLon } {
  const total = t.cum[t.cum.length - 1]!;
  const d = Math.max(0, Math.min(total, alongM));
  let lo = 0, hi = t.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t.cum[mid]! <= d) lo = mid;
    else hi = mid;
  }
  const seg = Math.min(lo, Math.max(0, t.geometry.length - 2));
  const len = t.cum[seg + 1]! - t.cum[seg]!;
  const u = len > 0 ? (d - t.cum[seg]!) / len : 0;
  const [aLat, aLon] = t.geometry[seg]!;
  const [bLat, bLon] = t.geometry[seg + 1] ?? t.geometry[seg]!;
  return { seg, point: [aLat + u * (bLat - aLat), aLon + u * (bLon - aLon)] };
}

/** The part of the route still ahead of `alongM` (what navigation draws). */
export function remainingGeometry(t: RouteTrack, alongM: number): LatLon[] {
  const { seg, point } = pointAt(t, alongM);
  return [point, ...t.geometry.slice(seg + 1)];
}

/** Direction of travel (degrees from north) over the next `aheadM` metres from `alongM`. */
export function bearingAt(t: RouteTrack, alongM: number, aheadM = 25): number {
  const total = t.cum[t.cum.length - 1]!;
  const from = Math.min(alongM, Math.max(0, total - aheadM));
  const a = pointAt(t, from).point;
  const b = pointAt(t, from + aheadM).point;
  const dx = (b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180);
  const dy = b[0] - a[0];
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}
