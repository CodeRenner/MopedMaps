import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { loadChunks } from '../src/data/loader';
import { IdbStore, MemoryStore } from '../src/data/store';

const buf = (n: number) => new Uint8Array([n, n, n]).buffer;

function fakeFetch(responses: Record<string, (number | 'throw')[]>) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const name = url.split('/').pop()!;
    const seq = responses[name] ?? [200];
    const status = seq.length > 1 ? seq.shift()! : seq[0]!;
    if (status === 'throw') throw new TypeError('network down');
    return {
      ok: status >= 200 && status < 300,
      status,
      arrayBuffer: async () => buf(Number(name.split('_')[0])),
    } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const base = { baseUrl: 'https://x.test/tiles/', buildId: 'b1', retryBaseMs: 1 };

describe('loadChunks', () => {
  it('downloads, caches and then serves from cache', async () => {
    const store = new MemoryStore();
    const f = fakeFetch({});
    const files = ['1_1.mmg', '2_2.mmg', '3_3.mmg'];
    const progress: number[] = [];
    const a = await loadChunks(files, { ...base, store, fetchFn: f.fn, onProgress: (p) => progress.push(p.done) });
    expect(a.map((b) => new Uint8Array(b)[0])).toEqual([1, 2, 3]);
    expect(f.calls).toEqual(files.map((n) => `https://x.test/tiles/${n}`));
    expect(progress).toEqual([1, 2, 3]);

    let cached = 0;
    await loadChunks(files, { ...base, store, fetchFn: f.fn, onProgress: (p) => (cached = p.fromCache) });
    expect(f.calls).toHaveLength(3);
    expect(cached).toBe(3);
  });

  it('a new build id ignores old cache entries', async () => {
    const store = new MemoryStore();
    const f = fakeFetch({});
    await loadChunks(['1_1.mmg'], { ...base, store, fetchFn: f.fn });
    await loadChunks(['1_1.mmg'], { ...base, buildId: 'b2', store, fetchFn: f.fn });
    expect(f.calls).toHaveLength(2);
    expect(await store.prune('b2')).toBe(1);
  });

  it('retries transient errors, gives up on 404', async () => {
    const store = new MemoryStore();
    const f = fakeFetch({ '1_1.mmg': [503, 'throw', 200], '2_2.mmg': [404] });
    const ok = await loadChunks(['1_1.mmg'], { ...base, store, fetchFn: f.fn });
    expect(new Uint8Array(ok[0]!)[0]).toBe(1);
    expect(f.calls).toHaveLength(3);
    await expect(loadChunks(['2_2.mmg'], { ...base, store, fetchFn: f.fn })).rejects.toThrow(/404/);
    expect(f.calls).toHaveLength(4);
  });

  it('fails after exhausting retries', async () => {
    const f = fakeFetch({ '1_1.mmg': ['throw'] });
    await expect(
      loadChunks(['1_1.mmg'], { ...base, store: new MemoryStore(), fetchFn: f.fn, retries: 2 }),
    ).rejects.toThrow(/network down/);
    expect(f.calls).toHaveLength(3);
  });

  it('survives a broken store (evicted / quota)', async () => {
    const broken = {
      get: async () => { throw new Error('evicted'); },
      put: async () => { throw new Error('quota'); },
      prune: async () => 0,
    };
    const f = fakeFetch({});
    const r = await loadChunks(['5_5.mmg'], { ...base, store: broken, fetchFn: f.fn });
    expect(new Uint8Array(r[0]!)[0]).toBe(5);
  });
});

describe('IdbStore', () => {
  it('persists across reopen and prunes old builds', async () => {
    const factory = new IDBFactory();
    const s1 = await IdbStore.open(factory);
    await s1.put('b1', 'a.mmg', buf(7));
    await s1.put('b2', 'a.mmg', buf(8));
    s1.close();
    const s2 = await IdbStore.open(factory);
    expect(new Uint8Array((await s2.get('b1', 'a.mmg'))!)[0]).toBe(7);
    expect(await s2.prune('b2')).toBe(1);
    expect(await s2.get('b1', 'a.mmg')).toBeUndefined();
    expect(new Uint8Array((await s2.get('b2', 'a.mmg'))!)[0]).toBe(8);
    s2.close();
  });
});
