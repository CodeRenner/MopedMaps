import { describe, expect, it } from 'vitest';
import { detectLocale, formatNumber, MESSAGES, translate } from '../src/i18n';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n', () => {
  it('de and en have the same keys and placeholders', () => {
    const de = MESSAGES.de;
    const en = MESSAGES.en;
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
    for (const k of Object.keys(de)) expect(placeholders(en[k]!), k).toEqual(placeholders(de[k]!));
  });

  it('covers every AreaError and NoRouteReason code', () => {
    for (const c of ['unknown-plz', 'no-location', 'no-tiles', 'router']) {
      expect(MESSAGES.de[`area.error.${c}`]).toBeDefined();
    }
    for (const c of ['no-graph', 'start-off-network', 'target-off-network', 'unreachable']) {
      expect(MESSAGES.de[`route.error.${c}`]).toBeDefined();
    }
  });

  it('interpolates and falls back', () => {
    expect(translate('de', 'area.radiusLabel', { km: 75 })).toBe('Umkreis: 75 km');
    expect(translate('en', 'area.radiusLabel', { km: 50 })).toBe('Radius: 50 km');
    expect(translate('en', 'no.such.key')).toBe('no.such.key');
    expect(translate('de', 'area.radiusLabel')).toBe('Umkreis: {km} km');
  });

  it('detects locale with German default', () => {
    expect(detectLocale(['en-GB', 'de'])).toBe('en');
    expect(detectLocale(['fr-FR', 'de-AT'])).toBe('de');
    expect(detectLocale(['fr'])).toBe('de');
  });

  it('formats numbers per locale', () => {
    expect(formatNumber('de', 19.94)).toBe('19,9');
    expect(formatNumber('en', 19.94)).toBe('19.9');
  });
});
