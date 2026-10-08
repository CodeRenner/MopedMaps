/** Text helpers for the navigation display. Pure. */

import { formatNumber, type Locale } from '../i18n';

/** "250 m" (rounded to 10 m) below 1 km, else "1,2 km". */
export function navDistance(locale: Locale, m: number): string {
  if (m < 1000) return `${Math.max(0, Math.round(m / 10) * 10)} m`;
  return `${formatNumber(locale, m / 1000, m < 10_000 ? 1 : 0)} km`;
}

/** Arrival clock time "14:32" from now + seconds. */
export function etaClock(now: Date, remainingS: number): string {
  const t = new Date(now.getTime() + remainingS * 1000);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

/** Arrow glyph for a turn kind. */
export const TURN_ARROW: Record<string, string> = {
  'slight-left': '↖',
  left: '←',
  'sharp-left': '↙',
  'slight-right': '↗',
  right: '→',
  'sharp-right': '↘',
  arrive: '⚑',
  straight: '↑',
};
