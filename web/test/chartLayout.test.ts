import { describe, expect, it } from 'vitest';
import { CHART_H, chartLayout, PLOT } from '../src/chart/layout';
import { chartSeries } from '../src/chart/model';

const series = chartSeries({
  distM: [0, 1500, 3200],
  heightM: [12, 30, 18],
  speedKmh: [45, 30],
});

describe('chart layout', () => {
  const L = chartLayout(series);

  it('x axis in km spans exactly the route, ticks inside it', () => {
    expect(L.xTicks.map((t) => t.value)).toEqual([0, 1, 2, 3]);
    expect(L.xTicks[0]!.pos).toBe(PLOT.left);
    expect(L.xOf(3200)).toBe(PLOT.right);
    expect(L.xTicks[3]!.pos).toBeLessThan(PLOT.right);
  });

  it('speed axis from 0, elevation axis around the heights', () => {
    expect(L.speedTicks.map((t) => t.value)).toEqual([0, 20, 40, 60]);
    expect(L.speedTicks[0]!.pos).toBe(PLOT.bottom);
    expect(L.elevationTicks.map((t) => t.value)).toEqual([10, 20, 30]);
  });

  it('paths stay inside the plot area', () => {
    const nums = (p: string) => [...p.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1]!, +m[2]!]);
    for (const [x, y] of [...nums(L.speedPath), ...nums(L.elevationLine)]) {
      expect(x).toBeGreaterThanOrEqual(PLOT.left);
      expect(x).toBeLessThanOrEqual(PLOT.right);
      expect(y).toBeGreaterThanOrEqual(PLOT.top);
      expect(y).toBeLessThanOrEqual(PLOT.bottom);
    }
    expect(L.elevationArea.endsWith('Z')).toBe(true);
    expect(PLOT.bottom).toBeLessThan(CHART_H);
  });

  it('maps x back to distance, clamped to the route', () => {
    expect(L.distanceAtX(L.xOf(1500))).toBeCloseTo(1500);
    expect(L.distanceAtX(0)).toBe(0);
    expect(L.distanceAtX(PLOT.right)).toBe(3200);
  });

  it('no elevation without heights', () => {
    const l = chartLayout(chartSeries({ distM: [0, 100], heightM: [null, null], speedKmh: [25] }));
    expect(l.elevationLine).toBe('');
    expect(l.elevationTicks).toEqual([]);
    expect(l.speedPath.startsWith('M')).toBe(true);
  });
});
