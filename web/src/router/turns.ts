/**
 * Turn costs between two consecutive arcs at a junction. Pure.
 *
 * Free: going straight or bending slightly (< TURN_FREE_MAX_DEG, includes a
 * road just changing its name), junctions without any alternative, and
 * following the main road where it bends (abknickende Vorfahrt: the incoming
 * and outgoing road have the same class and every other way out is a lower
 * class). Otherwise right/left turns cost time by sharpness (left more, it
 * crosses oncoming traffic) and left turns add a little risk.
 */

import {
  TURN_FREE_MAX_DEG,
  TURN_LEFT_RISK_POINTS,
  TURN_LEFT_S,
  TURN_RIGHT_S,
  TURN_UTURN_S,
} from '../config';
import type { Graph } from './graph';

export interface TurnCost {
  timeS: number;
  riskPts: number;
}

const FREE: TurnCost = { timeS: 0, riskPts: 0 };

/** Signed turn angle in degrees (-180..180], positive = right. */
export function turnAngle(inBearing: number, outBearing: number): number {
  const d = (((outBearing - inBearing) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

/** Cost of driving arc `inArc` and continuing on `outArc` (which starts where inArc ends). */
export function turnCost(g: Graph, inArc: number, outArc: number): TurnCost {
  const inEdge = g.arcEdge[inArc]!;
  const outEdge = g.arcEdge[outArc]!;
  if (inEdge === outEdge) return { timeS: TURN_UTURN_S, riskPts: 0 };
  const node = g.arcTarget[inArc]!;
  const angle = turnAngle(g.arcInBearing[inArc]!, g.arcOutBearing[outArc]!);
  const a = Math.abs(angle);
  if (a < TURN_FREE_MAX_DEG) return FREE;
  // Other ways out of the junction (not back the way we came).
  const outClass = g.edges[outEdge]!.roadClass;
  let alternatives = 0;
  let higherOrSameElsewhere = false;
  for (let b = g.arcStart[node]!; b < g.arcStart[node + 1]!; b++) {
    const e = g.arcEdge[b]!;
    if (b === outArc || e === inEdge) continue;
    alternatives++;
    if (g.edges[e]!.roadClass <= outClass) higherOrSameElsewhere = true;
  }
  if (alternatives === 0) return FREE; // a bend, not a choice
  if (g.edges[inEdge]!.roadClass === outClass && !higherOrSameElsewhere) return FREE; // main road bends
  const i = a < 60 ? 0 : a <= 135 ? 1 : 2;
  if (angle > 0) return { timeS: TURN_RIGHT_S[i], riskPts: 0 };
  return { timeS: TURN_LEFT_S[i], riskPts: i > 0 ? TURN_LEFT_RISK_POINTS : 0 };
}
