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

/** Energy/climb part of the route summary, e.g. "↑ 12 m · 0,52 kWh" or "↑ 12 m · 0,41 l". */
export function energySummary(
  locale: Locale,
  drive: 'electric' | 'combustion',
  energyWh: number,
  fuelL: number,
  ascentM: number,
): { key: string; params: Record<string, string> } {
  const climb = String(Math.round(ascentM));
  if (drive === 'combustion') {
    return { key: 'route.energy.combustion', params: { climb, litres: formatNumber(locale, fuelL, 2) } };
  }
  return energyWh >= 1000
    ? { key: 'route.energy.electricKwh', params: { climb, kwh: formatNumber(locale, energyWh / 1000, 2) } }
    : { key: 'route.energy.electricWh', params: { climb, wh: String(Math.round(energyWh)) } };
}
