/** App wiring: data loading, router worker, map layers, panels. */

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { GRAPH_BASE_URL, PLZ_TABLE_URL } from './config';
import { loadArea } from './data/area';
import { type Manifest, parseManifest } from './data/manifest';
import { type ChunkStore, IdbStore, MemoryStore } from './data/store';
import { getLocale, t } from './i18n';
import { circleBounds, circlePolygon } from './location/circle';
import { PlzIndex } from './location/plz';
import { type RouterPort, WorkerRouterPort } from './router/port';
import { createAreaPanel } from './ui/areaPanel';
import { areaErrorKey, downloadMb } from './ui/messages';

async function fetchJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function openStore(): Promise<ChunkStore> {
  try {
    return await IdbStore.open();
  } catch {
    return new MemoryStore(); // private mode / storage disabled
  }
}

const AREA_SOURCE = 'area';

function showArea(map: MapLibreMap, lat: number, lon: number, km: number): void {
  const data = circlePolygon(lat, lon, km);
  const src = map.getSource<GeoJSONSource>(AREA_SOURCE);
  if (src) {
    src.setData(data);
  } else {
    map.addSource(AREA_SOURCE, { type: 'geojson', data });
    map.addLayer({ id: 'area-fill', type: 'fill', source: AREA_SOURCE, paint: { 'fill-color': '#2b6cb0', 'fill-opacity': 0.06 } });
    map.addLayer({ id: 'area-line', type: 'line', source: AREA_SOURCE, paint: { 'line-color': '#2b6cb0', 'line-width': 2, 'line-dasharray': [2, 2] } });
  }
  map.fitBounds(circleBounds(lat, lon, km), { padding: 40, duration: 600 });
}

export async function startApp(map: MapLibreMap, ui: HTMLElement): Promise<void> {
  const [plzTable, store] = await Promise.all([fetchJson(PLZ_TABLE_URL), openStore()]);
  const plz = new PlzIndex(plzTable as ConstructorParameters<typeof PlzIndex>[0]);
  const router: RouterPort = new WorkerRouterPort(
    new Worker(new URL('./router/worker.ts', import.meta.url), { type: 'module' }),
  );
  let manifest: Manifest | null = null;

  const panel = createAreaPanel(plz, async (code, radiusKm) => {
    panel.setBusy(true);
    try {
      manifest ??= parseManifest(await fetchJson(`${GRAPH_BASE_URL}/manifest.json`));
      const area = await loadArea(
        { plz: code, radiusKm },
        {
          manifest,
          plzIndex: plz,
          store,
          router,
          baseUrl: GRAPH_BASE_URL,
          onProgress: (p) => panel.setStatus(t('area.loading', { done: p.done, total: p.total })),
        },
      );
      showArea(map, area.centre[0], area.centre[1], area.radiusKm);
      panel.setStatus(
        `${t('area.loaded', { label: area.label, km: area.radiusKm })} · ${t('area.downloadHint', {
          mb: downloadMb(getLocale(), area.downloadGzipBytes),
        })}`,
      );
    } catch (err) {
      console.error(err);
      panel.setStatus(t(areaErrorKey(err)), true);
    } finally {
      panel.setBusy(false);
    }
  });
  ui.append(panel.root);
}
