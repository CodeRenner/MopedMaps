/**
 * Pure data model for the route chart (x = distance, y = speed + elevation).
 * No DOM; the SVG view in ui/routeChart.ts only maps these points to pixels.
 */

import { ROUTE_CHART_MAX_POINTS } from '../config';
import type { RouteProfile } from '../router/routeProfile';

/** The part of the route profile the chart needs. */
export type ChartProfile = Pick<RouteProfile, 'distM' | 'heightM' | 'speedKmh'>;

/** [distance m, value] */
export type Pt = [number, number];

export interface ChartSeries {
  totalM: number;
  /** Speed as a step line (constant per edge), consecutive equal speeds merged. */
  speed: Pt[];
  /** Elevation at route nodes with known height; empty for v1 tiles. */
  elevation: Pt[];
}

/** Step line for speed: each run of equal speed is one horizontal segment. */
export function speedSteps(p: ChartProfile): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < p.speedKmh.length; i++) {
    const v = p.speedKmh[i]!;
    const d0 = p.distM[i]!;
    const d1 = p.distM[i + 1]!;
    const last = out[out.length - 1];
    if (last && last[1] === v) last[0] = d1;
    else out.push([d0, v], [d1, v]);
  }
  return out;
}

/**
 * Reduce a line to at most ~maxPoints by distance buckets, keeping the min and
 * max of each bucket (in distance order) so peaks and dips survive.
 */
export function downsample(pts: Pt[], maxPoints: number): Pt[] {
  if (pts.length <= maxPoints || pts.length < 3) return pts;
  const buckets = Math.max(1, Math.floor(maxPoints / 2));
  const d0 = pts[0]![0];
  const span = pts[pts.length - 1]![0] - d0 || 1;
  const out: Pt[] = [pts[0]!];
  let b = -1;
  let lo: Pt | null = null;
  let hi: Pt | null = null;
  const flush = () => {
    if (!lo || !hi) return;
    if (lo === hi) out.push(lo);
    else out.push(...(lo[0] <= hi[0] ? [lo, hi] : [hi, lo]));
  };
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const pb = Math.min(buckets - 1, Math.floor(((p[0] - d0) / span) * buckets));
    if (pb !== b) {
      flush();
      b = pb;
      lo = hi = p;
    } else {
      if (p[1] < lo![1]) lo = p;
      if (p[1] > hi![1]) hi = p;
    }
  }
  flush();
  out.push(pts[pts.length - 1]!);
  return out;
}

export function chartSeries(p: ChartProfile, maxPoints: number = ROUTE_CHART_MAX_POINTS): ChartSeries {
  const elevation: Pt[] = [];
  p.heightM.forEach((h, i) => {
    if (h !== null) elevation.push([p.distM[i]!, h]);
  });
  return {
    totalM: p.distM[p.distM.length - 1] ?? 0,
    speed: speedSteps(p),
    elevation: downsample(elevation, maxPoints),
  };
}

/** Round axis ticks (1/2/5 × 10^n) covering [min, max] with about `count` steps. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  if (ticks[ticks.length - 1]! < max) ticks.push(ticks[ticks.length - 1]! + step);
  return ticks;
}

/** Value of a series at distance d: step lookup (speed) or linear interpolation (elevation). */
export function valueAt(pts: Pt[], d: number, step = false): number | null {
  if (pts.length === 0) return null;
  // Last point at or before d (binary search; points are sorted by distance).
  let lo = 0;
  let hi = pts.length - 1;
  if (d < pts[0]![0]) return pts[0]![1];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid]![0] <= d) lo = mid;
    else hi = mid - 1;
  }
  const [d0, v0] = pts[lo]!;
  const next = pts[lo + 1];
  if (step || !next) return v0;
  const [d1, v1] = next;
  return d1 === d0 ? v1 : v0 + ((v1 - v0) * (d - d0)) / (d1 - d0);
}

/** SVG path "M x y L x y …" for points mapped by the given scales (1 decimal). */
export function svgPath(pts: Pt[], x: (d: number) => number, y: (v: number) => number): string {
  return pts.map(([d, v], i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)} ${y(v).toFixed(1)}`).join('');
}
