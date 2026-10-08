/** Turn instructions from the route geometry (no street names in the graph). Pure. */

import { NAV_TURN_MIN_DEG } from '../config';
import type { LatLon } from '../router/protocol';
import type { RouteTrack } from './progress';

export type TurnKind = 'slight-left' | 'left' | 'sharp-left' | 'slight-right' | 'right' | 'sharp-right' | 'arrive';

export interface Maneuver {
  /** Distance along the route where it happens (m). */
  atM: number;
  kind: TurnKind;
  /** Signed turn angle in degrees (positive = right). */
  angle: number;
}

function bearing(a: LatLon, b: LatLon): number {
  const r = Math.PI / 180;
  const y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
  const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

/** Point about `m` metres away from geometry index i, walking forward (dir 1) or back (-1). */
function pointAt(t: RouteTrack, i: number, m: number, dir: 1 | -1): LatLon {
  let j = i;
  while (j + dir >= 0 && j + dir < t.geometry.length) {
    j += dir;
    if (Math.abs(t.cum[j]! - t.cum[i]!) >= m) break;
  }
  return t.geometry[j]!;
}

export function turnKind(angle: number): TurnKind | null {
  const a = Math.abs(angle);
  if (a < NAV_TURN_MIN_DEG) return null;
  const side = angle > 0 ? 'right' : 'left';
  if (a < 60) return `slight-${side}`;
  if (a < 135) return side;
  return `sharp-${side}`;
}

/**
 * Maneuvers at route nodes (junctions): compare the heading ~20 m before and
 * after the node so shape points close to the junction don't fake a turn.
 */
export function maneuvers(t: RouteTrack): Maneuver[] {
  const out: Maneuver[] = [];
  for (let n = 1; n + 1 < t.geomIndex.length; n++) {
    const i = t.geomIndex[n]!;
    const node = t.geometry[i]!;
    const inB = bearing(pointAt(t, i, 20, -1), node);
    const outB = bearing(node, pointAt(t, i, 20, 1));
    const angle = ((outB - inB + 540) % 360) - 180;
    const kind = turnKind(angle);
    if (kind) out.push({ atM: t.cum[i]!, kind, angle });
  }
  out.push({ atM: t.cum[t.cum.length - 1]!, kind: 'arrive', angle: 0 });
  return out;
}

/** The next maneuver ahead of the current position (always at least 'arrive'). */
export function nextManeuver(list: Maneuver[], alongM: number): Maneuver {
  return list.find((m) => m.atM > alongM + 5) ?? list[list.length - 1]!;
}
