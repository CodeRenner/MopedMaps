import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeName, PlzIndex } from '../src/location/plz';

const small = new PlzIndex({
  v: 1,
  attribution: 'test',
  rows: [
    ['01067', 51.0574, 13.7117, 'Dresden'],
    ['28195', 53.0889, 8.7906, 'Bremen'],
    ['28199', 53.07, 8.8, 'Bremen'],
    ['28790', 53.2, 8.7, 'Schwanewede'],
    ['80331', 48.1345, 11.571, 'München'],
  ],
});

describe('PlzIndex', () => {
  it('exact lookup', () => {
    expect(small.get('28195')?.name).toBe('Bremen');
    expect(small.get(' 80331 ')?.lat).toBe(48.1345);
    expect(small.get('28196')).toBeUndefined();
    expect(small.get('2819')).toBeUndefined();
    expect(small.get('abcde')).toBeUndefined();
  });

  it('prefix search by digits', () => {
    expect(small.search('281').map((e) => e.plz)).toEqual(['28195', '28199']);
    expect(small.search('28').map((e) => e.plz)).toEqual(['28195', '28199', '28790']);
    expect(small.search('28', 1)).toHaveLength(1);
    expect(small.search('9')).toEqual([]);
  });

  it('name search ignores case and umlauts, prefix matches first', () => {
    expect(small.search('muenchen')[0]?.plz).toBe('80331');
    expect(small.search('MÜN')[0]?.plz).toBe('80331');
    expect(small.search('wede').map((e) => e.plz)).toEqual(['28790']);
    expect(small.search('br').map((e) => e.plz)).toEqual(['28195', '28199']);
  });

  it('validates the table', () => {
    expect(() => new PlzIndex({ v: 2, attribution: '', rows: [] })).toThrow();
    expect(
      () => new PlzIndex({ v: 1, attribution: '', rows: [['2', 0, 0, 'b'], ['1', 0, 0, 'a']] }),
    ).toThrow(/sorted/);
  });

  it('normalizes names', () => {
    expect(normalizeName('  Gießen ')).toBe('giessen');
    expect(normalizeName('Lörrach')).toBe('loerrach');
  });
});

describe('bundled plz.json', () => {
  const table = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'data', 'plz.json'), 'utf8'));
  const idx = new PlzIndex(table);

  it('covers Germany and carries attribution', () => {
    expect(idx.size).toBeGreaterThan(8000);
    expect(idx.attribution).toMatch(/GeoNames/);
  });

  it.each([
    ['28195', 'Bremen', 53.09, 8.8],
    ['10115', 'Berlin', 52.53, 13.38],
    ['80331', 'München', 48.13, 11.57],
    ['01067', 'Dresden', 51.06, 13.72],
  ])('%s is %s', (plz, name, lat, lon) => {
    const e = idx.get(plz)!;
    expect(e.name).toBe(name);
    expect(e.lat).toBeCloseTo(lat, 1);
    expect(e.lon).toBeCloseTo(lon, 1);
  });

  it('all coordinates are inside Germany', () => {
    for (const r of table.rows as [string, number, number, string][]) {
      expect(r[1]).toBeGreaterThan(47);
      expect(r[1]).toBeLessThan(55.1);
      expect(r[2]).toBeGreaterThan(5.8);
      expect(r[2]).toBeLessThan(15.1);
    }
  });
});
