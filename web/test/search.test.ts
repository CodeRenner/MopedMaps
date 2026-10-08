import { describe, expect, it } from 'vitest';
import { normalize, type PlacesTile, SearchIndex } from '../src/search/index';

const tile: PlacesTile = {
  v: 1,
  s: [
    ['Hauptstraße', '79312', 'Emmendingen', 4810000, 785000, ['1', '3', '5a', '7'], [10, 10, 10], [5, 5, 5]],
    ['Hauptstraße', '79341', 'Kenzingen', 4819000, 776000, ['2', '4'], [10], [5]],
    ['Gartenweg', '', '', 4811000, 786000, [], [], []],
  ],
  p: [
    ['Kreiskrankenhaus Emmendingen', 'amenity=hospital', 4810500, 785500],
    ['Emmendingen', 'place=town', 4812000, 785000],
    ['Kenzingen', 'place=town', 4819500, 776500],
    ['Aral', 'amenity=fuel', 4810100, 785100],
  ],
};
const idx = new SearchIndex();
idx.add(tile);
const NEAR_EM: [number, number] = [48.1, 7.85];

describe('offline search', () => {
  it('normalizes German street spellings', () => {
    expect(normalize('Hauptstr. 5')).toBe('hauptstrasse 5');
    expect(normalize('Hauptstr 5')).toBe('hauptstrasse 5');
    expect(normalize('Straße des 17. Juni')).toBe('strasse des 17 juni');
    expect(normalize('Ölmühle')).toBe('oelmuehle');
  });

  it('finds an address with house number, nearest town first', () => {
    const [r] = idx.search('Hauptstr 5a', NEAR_EM);
    expect(r).toMatchObject({ label: 'Hauptstraße 5a', detail: '79312 Emmendingen', kind: 'address' });
    expect(r!.lat).toBeCloseTo(48.1002, 4);
    expect(r!.lon).toBeCloseTo(7.8501, 4);
  });

  it('a town name in the query moves the search there', () => {
    expect(idx.search('hauptstrasse 2 kenzingen', NEAR_EM)[0]).toMatchObject({ detail: '79341 Kenzingen' });
    expect(idx.search('Hauptstraße 79341', NEAR_EM)[0]).toMatchObject({ detail: '79341 Kenzingen' });
  });

  it('falls back to the nearest house number', () => {
    expect(idx.search('Hauptstraße 6', NEAR_EM)[0]?.label).toBe('Hauptstraße 5a');
  });

  it('finds places by name and by kind', () => {
    expect(idx.search('Kreiskrankenhaus', NEAR_EM)[0]?.label).toBe('Kreiskrankenhaus Emmendingen');
    expect(idx.search('krankenhaus emmendingen', NEAR_EM)[0]?.label).toBe('Kreiskrankenhaus Emmendingen');
    expect(idx.search('Tankstelle', NEAR_EM)[0]).toMatchObject({ label: 'Aral', detail: 'Tankstelle · Emmendingen' });
  });

  it('finds streets without house numbers', () => {
    expect(idx.search('gartenw', NEAR_EM)[0]).toMatchObject({ label: 'Gartenweg', kind: 'street' });
    expect(idx.search('', NEAR_EM)).toEqual([]);
    expect(idx.search('xyz', NEAR_EM)).toEqual([]);
  });
});
