/**
 * Persistent chunk cache. Entries are keyed by build id + file name so a new
 * graph build never mixes with old chunks. iOS may evict web storage at any
 * time; callers must treat every miss as normal and re-download.
 */

export interface ChunkStore {
  get(buildId: string, name: string): Promise<ArrayBuffer | undefined>;
  put(buildId: string, name: string, data: ArrayBuffer): Promise<void>;
  /** Delete every entry that does not belong to `keepBuildId`. */
  prune(keepBuildId: string): Promise<number>;
}

export class MemoryStore implements ChunkStore {
  private readonly map = new Map<string, ArrayBuffer>();

  async get(buildId: string, name: string): Promise<ArrayBuffer | undefined> {
    return this.map.get(`${buildId}|${name}`);
  }

  async put(buildId: string, name: string, data: ArrayBuffer): Promise<void> {
    this.map.set(`${buildId}|${name}`, data);
  }

  async prune(keep: string): Promise<number> {
    let n = 0;
    for (const k of [...this.map.keys()]) {
      if (!k.startsWith(`${keep}|`)) {
        this.map.delete(k);
        n++;
      }
    }
    return n;
  }
}

const DB_NAME = 'mopedmaps';
const DB_VERSION = 2;
/** Object stores: graph chunks, and the offline-search place tiles (pruned separately). */
export type StoreName = 'chunks' | 'places';
const STORES: StoreName[] = ['chunks', 'places'];

interface Row {
  key: string; // `${buildId}|${name}`
  buildId: string;
  data: ArrayBuffer;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class IdbStore implements ChunkStore {
  private constructor(
    private readonly db: IDBDatabase,
    private readonly store: StoreName,
  ) {}

  static async open(factory: IDBFactory = indexedDB, store: StoreName = 'chunks'): Promise<IdbStore> {
    const r = factory.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      for (const name of STORES) {
        if (r.result.objectStoreNames.contains(name)) continue;
        const os = r.result.createObjectStore(name, { keyPath: 'key' });
        os.createIndex('buildId', 'buildId');
      }
    };
    return new IdbStore(await req(r), store);
  }

  close(): void {
    this.db.close();
  }

  async get(buildId: string, name: string): Promise<ArrayBuffer | undefined> {
    const tx = this.db.transaction(this.store, 'readonly');
    const row = (await req(tx.objectStore(this.store).get(`${buildId}|${name}`))) as Row | undefined;
    return row?.data;
  }

  async put(buildId: string, name: string, data: ArrayBuffer): Promise<void> {
    const tx = this.db.transaction(this.store, 'readwrite');
    await req(tx.objectStore(this.store).put({ key: `${buildId}|${name}`, buildId, data } satisfies Row));
  }

  async prune(keep: string): Promise<number> {
    const tx = this.db.transaction(this.store, 'readwrite');
    const os = tx.objectStore(this.store);
    const keys = (await req(os.getAllKeys())) as string[];
    const stale = keys.filter((k) => !k.startsWith(`${keep}|`));
    await Promise.all(stale.map((k) => req(os.delete(k))));
    return stale.length;
  }
}
