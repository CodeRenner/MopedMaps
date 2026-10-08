/** Tap-to-route state machine. Pure: no DOM, no map. */

import type { LatLon } from '../router/protocol';

export interface PickerState {
  start: LatLon | null;
  target: LatLon | null;
}

export const EMPTY: PickerState = { start: null, target: null };

/**
 * First tap sets the start, second the target (route is requested). Once a
 * route exists, taps are ignored so zooming/panning around the route cannot
 * cancel it by accident; use `EMPTY` (cancel button) to start over.
 */
export function tap(s: PickerState, p: LatLon): PickerState {
  if (!s.start) return { start: p, target: s.target }; // keeps a destination chosen from the list
  if (!s.target) return { start: s.start, target: p };
  return s;
}

export function wantsRoute(s: PickerState): s is { start: LatLon; target: LatLon } {
  return s.start !== null && s.target !== null;
}

/** i18n key for the hint shown while picking. */
export function hintKey(s: PickerState): string {
  return s.start ? 'route.tapTarget' : 'route.tapStart';
}

/** Swap start and target (only meaningful when both are set). */
export function reverse(s: PickerState): PickerState {
  return wantsRoute(s) ? { start: s.target, target: s.start } : s;
}
