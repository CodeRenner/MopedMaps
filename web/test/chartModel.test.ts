import { describe, expect, it } from 'vitest';
import { chartSeries, downsample, niceTicks, type Pt, speedSteps, svgPath, valueAt } from '../src/chart/model';
import type { ChartProfile } from '../src/chart/model';

const P: ChartProfile = {
  distM: [0, 100, 300, 600, 1000],
  heightM: [10, 12, null, 20, 15],
  speedKmh: [30, 30, 45, 30],
};

describe('chart model', () => {
  it('merges equal consecutive speeds into steps', () => {
    expect(speedSteps(P)).toEqual([[0, 30], [300, 30], [300, 45], [600, 45], [600, 30], [1000, 30]]);
  });

  it('builds series; elevation skips unknown heights', () => {
    const s = chartSeries(P);
    expect(s.totalM).toBe(1000);
    expect(s.elevation).toEqual([[0, 10], [100, 12], [600, 20], [1000, 15]]);
    expect(chartSeries({ distM: [0, 50], heightM: [null, null], speedKmh: [25] }).elevation).toEqual([]);
  });

  it('downsampling keeps endpoints and extremes and bounds the size', () => {
    const pts: Pt[] = Array.from({ length: 5000 }, (_, i) => [i, Math.sin(i / 50) * 10]);
    pts[2500] = [2500, 99];
    const d = downsample(pts, 200);
    expect(d.length).toBeLessThanOrEqual(202);
    expect(d[0]).toEqual(pts[0]);
    expect(d[d.length - 1]).toEqual(pts[4999]);
    expect(Math.max(...d.map((p) => p[1]))).toBe(99);
    for (let i = 1; i < d.length; i++) expect(d[i]![0]).toBeGreaterThanOrEqual(d[i - 1]![0]);
    expect(downsample(pts.slice(0, 10), 200)).toHaveLength(10);
  });

  it('nice ticks cover the range with round steps', () => {
    expect(niceTicks(0, 45)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(3.8, 29.5)).toEqual([0, 10, 20, 30]);
    expect(niceTicks(0, 1000, 5)).toEqual([0, 200, 400, 600, 800, 1000]);
    expect(niceTicks(5, 5)).toEqual([5]);
  });

  it('reads values: steps for speed, interpolation for elevation', () => {
    const s = chartSeries(P);
    expect(valueAt(s.speed, 150, true)).toBe(30);
    expect(valueAt(s.speed, 300, true)).toBe(45);
    expect(valueAt(s.speed, 999, true)).toBe(30);
    expect(valueAt(s.elevation, 350)).toBeCloseTo(16);
    expect(valueAt(s.elevation, -5)).toBe(10);
    expect(valueAt(s.elevation, 2000)).toBe(15);
    expect(valueAt([], 1)).toBeNull();
  });

  it('formats SVG paths', () => {
    expect(svgPath([[0, 0], [10, 5]], (d) => d * 2, (v) => 100 - v)).toBe('M0.0 100.0L20.0 95.0');
  });
});
