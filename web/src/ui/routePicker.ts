/** Tap-to-route state machine. Pure: no DOM, no map. */

import type { LatLon } from '../router/protocol';

export interface PickerState {
  start: LatLon | null;
  target: LatLon | null;
}

export const EMPTY: PickerState = { start: null, target: null };

/**
 * First tap sets the start, second the target (route is requested),
 * a third tap starts over with a new start.
 */
export function tap(s: PickerState, p: LatLon): PickerState {
  if (!s.start || s.target) return { start: p, target: null };
  return { start: s.start, target: p };
}

export function wantsRoute(s: PickerState): s is { start: LatLon; target: LatLon } {
  return s.start !== null && s.target !== null;
}

/** i18n key for the hint shown while picking. */
export function hintKey(s: PickerState): string {
  return s.start ? 'route.tapTarget' : 'route.tapStart';
}
