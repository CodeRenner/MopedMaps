/** Pure mapping from domain results/errors to i18n keys and params. */

import { AreaError } from '../data/area';
import { formatNumber, type Locale } from '../i18n';
import type { NoRouteReason } from '../router/protocol';

export function areaErrorKey(err: unknown): string {
  if (err instanceof AreaError) return `area.error.${err.code}`;
  return 'area.error.network';
}

export function routeErrorKey(reason: NoRouteReason): string {
  return `route.error.${reason}`;
}

export function downloadMb(locale: Locale, gzipBytes: number): string {
  return formatNumber(locale, Math.max(0.1, gzipBytes / 1_000_000), 1);
}

export function routeSummaryParams(locale: Locale, distanceM: number, timeS: number) {
  return { km: formatNumber(locale, distanceM / 1000, 1), min: Math.max(1, Math.round(timeS / 60)) };
}
