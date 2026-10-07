/**
 * Pixel layout of the route chart: scales, axis ticks and SVG paths for a
 * fixed viewBox. Pure, so it can be tested without a DOM.
 */

import { type ChartSeries, niceTicks, svgPath } from './model';

export const CHART_W = 320;
export const CHART_H = 150;
/** Plot area inside the viewBox (room for left/right/bottom axis labels). */
export const PLOT = { left: 30, right: CHART_W - 32, top: 8, bottom: CHART_H - 18 } as const;

export interface Tick {
  pos: number;
  value: number;
}

export interface ChartLayout {
  speedPath: string;
  /** Closed area under the elevation line; '' without heights. */
  elevationArea: string;
  elevationLine: string;
  xTicks: Tick[]; // value in km
  speedTicks: Tick[]; // km/h, left axis
  elevationTicks: Tick[]; // m, right axis
  /** Distance (m) at a viewBox x coordinate, clamped to the route. */
  distanceAtX(x: number): number;
  xOf(distM: number): number;
}

const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) =>
  d1 === d0 ? r0 : r0 + ((v - d0) * (r1 - r0)) / (d1 - d0);

export function chartLayout(s: ChartSeries): ChartLayout {
  const totalKm = s.totalM / 1000;
  // The x axis ends exactly at the route end; ticks are round values inside it.
  const xMaxKm = totalKm || 1;
  const kmTicks = niceTicks(0, xMaxKm, 4).filter((v) => v <= xMaxKm + 1e-9);
  const xOf = lin(0, xMaxKm * 1000, PLOT.left, PLOT.right);

  const maxSpeed = Math.max(1, ...s.speed.map((p) => p[1]));
  const sTicks = niceTicks(0, maxSpeed, 3);
  const ySpeed = lin(sTicks[0]!, sTicks[sTicks.length - 1]!, PLOT.bottom, PLOT.top);

  let elevationArea = '';
  let elevationLine = '';
  let elevationTicks: Tick[] = [];
  if (s.elevation.length >= 2) {
    const hs = s.elevation.map((p) => p[1]);
    const eTicks = niceTicks(Math.min(...hs), Math.max(...hs), 3);
    const yEl = lin(eTicks[0]!, eTicks[eTicks.length - 1]!, PLOT.bottom, PLOT.top);
    elevationLine = svgPath(s.elevation, xOf, yEl);
    const first = s.elevation[0]!;
    const last = s.elevation[s.elevation.length - 1]!;
    elevationArea = `${elevationLine}L${xOf(last[0]).toFixed(1)} ${PLOT.bottom}L${xOf(first[0]).toFixed(1)} ${PLOT.bottom}Z`;
    elevationTicks = eTicks.map((value) => ({ value, pos: yEl(value) }));
  }

  const toDist = lin(PLOT.left, PLOT.right, 0, xMaxKm * 1000);
  return {
    speedPath: svgPath(s.speed, xOf, ySpeed),
    elevationArea,
    elevationLine,
    xTicks: kmTicks.map((value) => ({ value, pos: xOf(value * 1000) })),
    speedTicks: sTicks.map((value) => ({ value, pos: ySpeed(value) })),
    elevationTicks,
    distanceAtX: (x) => Math.min(s.totalM, Math.max(0, toDist(x))),
    xOf,
  };
}
