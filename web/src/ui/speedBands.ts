/** Route sections on fast roads, for colouring the route line. Pure. */

import { ROUTE_BAND_MIN_M, ROUTE_BAND_ORANGE_ABOVE_KMH, ROUTE_BAND_RED_ABOVE_KMH } from '../config';
import type { LatLon } from '../router/protocol';
import type { RouteProfile } from '../router/routeProfile';

export type Band = 'orange' | 'red';

export interface BandSection {
  band: Band;
  coords: LatLon[];
  lengthM: number;
  /** Route geometry index of coords[0]. */
  startIdx: number;
}

/** > 50 km/h orange, > 70 km/h red, otherwise no band. */
export function bandFor(limitKmh: number): Band | null {
  if (limitKmh > ROUTE_BAND_RED_ABOVE_KMH) return 'red';
  if (limitKmh > ROUTE_BAND_ORANGE_ABOVE_KMH) return 'orange';
  return null;
}

/** Consecutive edges with the same band merged into one polyline each; sections shorter than minM dropped. */
export function speedBands(
  geometry: LatLon[],
  p: Pick<RouteProfile, 'limitKmh' | 'geomIndex' | 'distM'>,
  minM: number = ROUTE_BAND_MIN_M,
): BandSection[] {
  const out: BandSection[] = [];
  let open: BandSection | null = null;
  p.limitKmh.forEach((limit, i) => {
    const band = bandFor(limit);
    const part = geometry.slice(p.geomIndex[i], p.geomIndex[i + 1]! + 1);
    const len = p.distM[i + 1]! - p.distM[i]!;
    if (band && open && open.band === band) {
      open.coords.push(...part.slice(1));
      open.lengthM += len;
    } else if (band) out.push((open = { band, coords: part, lengthM: len, startIdx: p.geomIndex[i]! }));
    else open = null;
  });
  return out.filter((b) => b.lengthM >= minM);
}

/**
 * Bands still ahead of a cut on route segment `seg` at `point` (navigation hides
 * the part already ridden): bands behind are dropped, a band containing the
 * cut starts at the cut.
 */
export function bandsAhead(bands: BandSection[], seg: number, point: LatLon): BandSection[] {
  const out: BandSection[] = [];
  for (const b of bands) {
    const endIdx = b.startIdx + b.coords.length - 1;
    if (endIdx <= seg) continue;
    if (b.startIdx > seg) out.push(b);
    else out.push({ ...b, coords: [point, ...b.coords.slice(seg - b.startIdx + 1)], startIdx: seg });
  }
  return out;
}
