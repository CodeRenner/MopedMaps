import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AreaError, clampRadius, loadArea } from '../src/data/area';
import { type Manifest, parseManifest } from '../src/data/manifest';
import { MemoryStore } from '../src/data/store';
import { PlzIndex } from '../src/location/plz';
import { LocalRouterPort } from '../src/router/port';

const FIX = join(__dirname, 'fixtures');
const plzIndex = new PlzIndex({
  v: 1,
  attribution: 't',
  rows: [
    ['28195', 53.074, 8.81, 'Testhausen'],
    ['80331', 48.1345, 11.571, 'München'],
  ],
});
const manifest: Manifest = {
  format: 'mmg', version: 1, tile_size_deg: 0.25, built_at: 'T1', source: 's',
  attribution: '© OpenStreetMap contributors', totals: {},
  tiles: { '212_35.mmg': { ix: 35, iy: 212, bytes: 1, gzip_bytes: 1, nodes: 5, edges: 4 } },
};

function serveDir(dir: string, rename: (n: string) => string = (n) => n) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    const name = url.split('/').pop()!;
    calls.push(name);
    const path = join(dir, rename(name));
    if (!existsSync(path)) return { ok: false, status: 404 } as Response;
    const b = readFileSync(path);
    return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('loadArea', () => {
  it('PLZ -> tiles -> cache -> router, then routes', async () => {
    const router = new LocalRouterPort();
    const store = new MemoryStore();
    const srv = serveDir(FIX, (n) => `small_${n}`);
    const area = await loadArea(
      { plz: '28195', radiusKm: 10 },
      { manifest, plzIndex, store, router, baseUrl: '/tiles', fetchFn: srv.fn },
    );
    expect(area).toMatchObject({ label: '28195 Testhausen', radiusKm: 25, files: ['212_35.mmg'], nodeCount: 5, edgeCount: 4 });
    const r = await router.request({
      type: 'route', from: [53.075, 8.8], to: [53.07, 8.82], profile: { vmaxKmh: 25, drive: 'electric' },
    });
    expect(r.type).toBe('route');

    // second load hits the cache
    await loadArea({ plz: '28195' }, { manifest, plzIndex, store, router, baseUrl: '/tiles', fetchFn: srv.fn });
    expect(srv.calls).toEqual(['212_35.mmg']);
  });

  it('reports unknown PLZ and areas without data', async () => {
    const deps = { manifest, plzIndex, store: new MemoryStore(), router: new LocalRouterPort(), baseUrl: '/t' };
    await expect(loadArea({ plz: '99999' }, deps)).rejects.toMatchObject({ code: 'unknown-plz' });
    await expect(loadArea({ plz: '80331' }, deps)).rejects.toMatchObject({ code: 'no-tiles' });
    await expect(loadArea({}, deps)).rejects.toBeInstanceOf(AreaError);
  });

  it('clamps the radius to the configured bounds', () => {
    expect(clampRadius(5)).toBe(25);
    expect(clampRadius(500)).toBe(100);
    expect(clampRadius(60)).toBe(60);
    expect(clampRadius(Number.NaN)).toBe(75);
  });
});

const BREMEN = join(__dirname, '..', '..', 'data', 'tiles-bremen');
describe.skipIf(!existsSync(BREMEN))('Bremen end-to-end (local data)', () => {
  it('PLZ 28195, 25 km radius, Hbf -> Vegesack', async () => {
    const realPlz = new PlzIndex(JSON.parse(readFileSync(join(__dirname, '..', 'public', 'data', 'plz.json'), 'utf8')));
    const m = parseManifest(JSON.parse(readFileSync(join(BREMEN, 'manifest.json'), 'utf8')));
    const router = new LocalRouterPort();
    const area = await loadArea(
      { plz: '28195', radiusKm: 25 },
      { manifest: m, plzIndex: realPlz, store: new MemoryStore(), router, baseUrl: '/', fetchFn: serveDir(BREMEN).fn },
    );
    expect(area.files.length).toBeGreaterThanOrEqual(3);
    const r = await router.request({
      type: 'route', from: [53.0833, 8.8131], to: [53.1717, 8.6206], profile: { vmaxKmh: 45, drive: 'combustion' },
    });
    expect(r.type).toBe('route');
  });
});
