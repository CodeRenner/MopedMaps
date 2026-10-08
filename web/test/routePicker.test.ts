import { describe, expect, it } from 'vitest';
import { EMPTY, hintKey, reverse, tap, wantsRoute } from '../src/ui/routePicker';

describe('route picker', () => {
  it('start -> target, further taps keep the route', () => {
    let s = tap(EMPTY, [1, 1]);
    expect(s).toEqual({ start: [1, 1], target: null });
    expect(wantsRoute(s)).toBe(false);
    expect(hintKey(s)).toBe('route.tapTarget');

    s = tap(s, [2, 2]);
    expect(s).toEqual({ start: [1, 1], target: [2, 2] });
    expect(wantsRoute(s)).toBe(true);

    // a stray tap while zooming must not cancel the route
    expect(tap(s, [3, 3])).toBe(s);
  });

  it('reverse swaps start and target only when both are set', () => {
    expect(reverse({ start: [1, 1], target: [2, 2] })).toEqual({ start: [2, 2], target: [1, 1] });
    const half = { start: [1, 1] as [number, number], target: null };
    expect(reverse(half)).toBe(half);
    expect(reverse(EMPTY)).toBe(EMPTY);
  });

  it('hints the start first', () => {
    expect(hintKey(EMPTY)).toBe('route.tapStart');
  });
});
