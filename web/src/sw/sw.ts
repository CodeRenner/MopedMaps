/// <reference lib="webworker" />
/**
 * Service worker. The precache list (hashed asset names) is prepended at
 * build time by the `precacheManifest` plugin in vite.config.ts as
 * `self.__PRECACHE_MANIFEST__ = [...]` — a global, so the minifier cannot
 * constant-fold it away.
 */

import { hashList, strategyFor } from './policy';
import { withoutRedirect } from './response';

declare const self: ServiceWorkerGlobalScope & { __PRECACHE_MANIFEST__?: string[] };

const PRECACHE: string[] = self.__PRECACHE_MANIFEST__ ?? [];
const VERSION = hashList(PRECACHE);
const SHELL = `shell-${VERSION}`;
const RUNTIME = 'runtime-v1';
const precacheSet = new Set(PRECACHE);
// Hosts may send `Vary: Origin`; module scripts/CSS with `crossorigin` carry an
// Origin header the precached requests lacked, so Vary must be ignored.
const MATCH: CacheQueryOptions = { ignoreVary: true };

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches
      .open(SHELL)
      .then((c) =>
        // Store redirect-free copies (see response.ts); cache.addAll would keep the flag.
        Promise.all(
          PRECACHE.map(async (p) => {
            const url = new URL(p, self.registration.scope).href;
            const res = await fetch(url, { cache: 'reload' });
            if (!res.ok) throw new Error(`precache ${url}: ${res.status}`);
            await c.put(url, await withoutRedirect(res));
          }),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  const strategy = strategyFor(url, scope, precacheSet, req.mode === 'navigate');
  if (strategy === 'passthrough') return;

  if (strategy === 'precache') {
    const key = req.mode === 'navigate' ? new URL('index.html', scope).href : req;
    // Also guards caches written by older workers that stored redirected responses.
    ev.respondWith(caches.match(key, MATCH).then((hit) => (hit ? withoutRedirect(hit) : fetch(req))));
  } else if (strategy === 'network-first') {
    ev.respondWith(
      fetch(req)
        .then(async (res) => {
          if (res.ok) await (await caches.open(RUNTIME)).put(req, res.clone());
          return res;
        })
        .catch(async () => (await caches.match(req, MATCH)) ?? Response.error()),
    );
  } else {
    ev.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const hit = await cache.match(req, MATCH);
        const update = fetch(req)
          .then((res) => {
            if (res.ok) void cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit ?? Response.error());
        if (hit) {
          ev.waitUntil(update.then(() => undefined));
          return hit;
        }
        return update;
      }),
    );
  }
});
