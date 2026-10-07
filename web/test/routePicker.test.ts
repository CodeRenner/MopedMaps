import { describe, expect, it } from 'vitest';
import { EMPTY, hintKey, tap, wantsRoute } from '../src/ui/routePicker';

describe('route picker', () => {
  it('start -> target -> restart', () => {
    let s = tap(EMPTY, [1, 1]);
    expect(s).toEqual({ start: [1, 1], target: null });
    expect(wantsRoute(s)).toBe(false);
    expect(hintKey(s)).toBe('route.tapTarget');

    s = tap(s, [2, 2]);
    expect(s).toEqual({ start: [1, 1], target: [2, 2] });
    expect(wantsRoute(s)).toBe(true);

    s = tap(s, [3, 3]);
    expect(s).toEqual({ start: [3, 3], target: null });
  });

  it('hints the start first', () => {
    expect(hintKey(EMPTY)).toBe('route.tapStart');
  });
});
