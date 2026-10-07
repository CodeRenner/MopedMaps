/** Pure mapping from domain results/errors to i18n keys and params. */

import { AreaError } from '../data/area';
import { formatNumber, type Locale } from '../i18n';
import type { NoRouteReason } from '../router/protocol';
import type { RangeEstimate } from '../router/range';

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

/**
 * Range part of the route summary, e.g. "29 % Akku · Rest ca. 47 km", plus an
 * optional reserve warning. Null without a capacity.
 */
export function rangeSummary(
  locale: Locale,
  drive: 'electric' | 'combustion',
  est: RangeEstimate,
  reserveShare: number,
): { key: string; params: Record<string, string>; warning: { key: string; params: Record<string, string> } | null } | null {
  if (est.usedShare === null) return null;
  const share = String(Math.round(est.usedShare * 100));
  if (est.usedShare >= 1) {
    // Trip needs more than a full battery/tank: say so instead of "0 km left" + reserve warning.
    return { key: `route.range.${drive}Short`, params: { share }, warning: { key: 'route.range.short', params: {} } };
  }
  const km = est.remainingKm === null ? '–' : formatNumber(locale, est.remainingKm, est.remainingKm < 10 ? 1 : 0);
  return {
    key: `route.range.${drive}`,
    params: { share, km },
    warning: est.belowReserve
      ? { key: 'route.range.reserve', params: { reserve: String(Math.round(reserveShare * 100)) } }
      : null,
  };
}
