/** Download graph chunks with cache, retry and bounded concurrency. Pure-ish: fetch and store are injected. */

import type { ChunkStore } from './store';

export const CHUNK_FETCH_RETRIES = 3;
export const CHUNK_FETCH_CONCURRENCY = 4;
export const CHUNK_RETRY_BASE_MS = 500;

export interface LoadProgress {
  done: number;
  total: number;
  fromCache: number;
  bytes: number;
}

export interface LoadOptions {
  baseUrl: string;
  buildId: string;
  store: ChunkStore;
  fetchFn?: typeof fetch;
  retries?: number;
  concurrency?: number;
  retryBaseMs?: number;
  onProgress?: (p: LoadProgress) => void;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, o: LoadOptions): Promise<ArrayBuffer> {
  const f = o.fetchFn ?? fetch;
  const retries = o.retries ?? CHUNK_FETCH_RETRIES;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (o.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    try {
      const res = await f(url, o.signal ? { signal: o.signal } : undefined);
      if (res.ok) return await res.arrayBuffer();
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
      if (res.status >= 400 && res.status < 500) break; // not retryable
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      lastErr = err;
    }
    if (attempt < retries) await sleep((o.retryBaseMs ?? CHUNK_RETRY_BASE_MS) * 2 ** attempt);
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Return the chunk buffers for `files` (same order). Cached chunks of the
 * same build are used; missing ones are downloaded and cached. A failed cache
 * write (quota, eviction) is ignored: routing still works for this session.
 */
export async function loadChunks(files: readonly string[], o: LoadOptions): Promise<ArrayBuffer[]> {
  const out: ArrayBuffer[] = new Array(files.length);
  const p: LoadProgress = { done: 0, total: files.length, fromCache: 0, bytes: 0 };
  let next = 0;

  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      const name = files[i]!;
      let buf: ArrayBuffer | undefined;
      try {
        buf = await o.store.get(o.buildId, name);
      } catch {
        buf = undefined; // storage unavailable or evicted
      }
      if (buf) {
        p.fromCache++;
      } else {
        buf = await fetchWithRetry(`${o.baseUrl.replace(/\/$/, '')}/${name}`, o);
        await o.store.put(o.buildId, name, buf).catch(() => undefined);
      }
      out[i] = buf;
      p.done++;
      p.bytes += buf.byteLength;
      o.onProgress?.({ ...p });
    }
  };

  const n = Math.max(1, Math.min(o.concurrency ?? CHUNK_FETCH_CONCURRENCY, files.length));
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}
