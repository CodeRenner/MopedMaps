import { describe, expect, it } from 'vitest';
import { loadSearchData } from '../src/data/places';
import { MemoryStore } from '../src/data/store';

const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o)).buffer as ArrayBuffer;
const INDEX = { format: 'places', version: 1, built_at: 'T1', tiles: { '212_35.json': { bytes: 1, gzip_bytes: 1 } } };
const TILE = { v: 1, s: [['Obernstraße', '28195', 'Bremen', 5307600, 880600, ['5'], [], []]], p: [] };

function server(online: () => boolean) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    if (!online()) throw new TypeError('Failed to fetch');
    const body = url.endsWith('index.json') ? INDEX : url.endsWith('212_35.json') ? TILE : null;
    return body ? ({ ok: true, status: 200, arrayBuffer: async () => enc(body) } as Response) : ({ ok: false, status: 404 } as Response);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('loadSearchData', () => {
  it('loads the area tiles, then works offline from the cache', async () => {
    let online = true;
    const srv = server(() => online);
    const store = new MemoryStore();
    const files = ['212_35.mmg', '212_36.mmg']; // 212_36 has no places tile
    const a = await loadSearchData(files, { baseUrl: '/g', store, fetchFn: srv.fn });
    expect(a?.search('obernstr 5', [53.07, 8.8])[0]?.label).toBe('Obernstraße 5');
    expect(srv.calls).toEqual(['/g/places/index.json', '/g/places/212_35.json']);

    online = false;
    const b = await loadSearchData(files, { baseUrl: '/g', store, fetchFn: srv.fn });
    expect(b?.size.streets).toBe(1);
  });

  it('returns null without any index', async () => {
    const srv = server(() => false);
    expect(await loadSearchData(['212_35.mmg'], { baseUrl: '/g', store: new MemoryStore(), fetchFn: srv.fn })).toBeNull();
  });
});
