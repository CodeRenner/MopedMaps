/**
 * Minimal i18n: flat JSON dictionaries, German first (CLAUDE.md), English as
 * second language. Missing keys fall back to German, then to the key itself.
 */

import de from './de.json';
import en from './en.json';

export type Messages = Record<string, string>;
export type Locale = 'de' | 'en';

export const MESSAGES: Record<Locale, Messages> = { de, en };
export const DEFAULT_LOCALE: Locale = 'de';

/** Pick a supported locale from browser preferences (e.g. navigator.languages). */
export function detectLocale(preferred: readonly string[]): Locale {
  for (const p of preferred) {
    const base = p.toLowerCase().split('-')[0];
    if (base === 'de' || base === 'en') return base;
  }
  return DEFAULT_LOCALE;
}

export type Params = Record<string, string | number>;

export function translate(locale: Locale, key: string, params: Params = {}): string {
  const msg = MESSAGES[locale][key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
  return msg.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m,
  );
}

/** Locale-aware number formatting (decimal comma in German). */
export function formatNumber(locale: Locale, n: number, digits = 1): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

let current: Locale = DEFAULT_LOCALE;
export function setLocale(l: Locale): void {
  current = l;
}
export function getLocale(): Locale {
  return current;
}
export function t(key: string, params?: Params): string {
  return translate(current, key, params);
}
