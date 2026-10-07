/** App wiring: data loading, router worker, map layers, panels. */

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { GRAPH_BASE_URL, PLZ_TABLE_URL, REROUTE_DEBOUNCE_MS } from './config';
import { loadArea } from './data/area';
import { type Manifest, parseManifest } from './data/manifest';
import { type ChunkStore, IdbStore, MemoryStore } from './data/store';
import { getLocale, t } from './i18n';
import { circleBounds, circlePolygon } from './location/circle';
import { PlzIndex } from './location/plz';
import { type RouterPort, WorkerRouterPort } from './router/port';
import type { CostWeights, VehicleProfile } from './router/profile';
import { createAreaPanel } from './ui/areaPanel';
import { areaErrorKey, downloadMb, routeErrorKey, routeSummaryParams } from './ui/messages';
import { createProfilePanel } from './ui/profilePanel';
import { loadProfile, saveProfile } from './ui/profileStore';
import { RouteLayer } from './ui/routeLayer';
import { EMPTY, hintKey, type PickerState, tap, wantsRoute } from './ui/routePicker';
import { loadWeights, riskClass, saveWeights } from './ui/weights';
import { createWeightsPanel } from './ui/weightsPanel';

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
  let areaLoaded = false;
  const routeLayer = new RouteLayer(map);
  let picker: PickerState = EMPTY;
  let routeSeq = 0;
  const storage = safeLocalStorage();
  let profile: VehicleProfile = loadProfile(storage);
  let weights: CostWeights = loadWeights(storage);
  let rerouteTimer: ReturnType<typeof setTimeout> | undefined;

  map.on('click', (ev) => {
    if (!areaLoaded) return;
    picker = tap(picker, [ev.lngLat.lat, ev.lngLat.lng]);
    routeLayer.setPoints(picker);
    void computeRoute();
  });

  async function computeRoute(): Promise<void> {
    routeLayer.setRoute(null);
    if (!wantsRoute(picker)) {
      panel.setStatus(t(hintKey(picker)));
      return;
    }
    const seq = ++routeSeq;
    panel.setStatus(t('route.computing'));
    const res = await router.request({
      type: 'route',
      from: picker.start,
      to: picker.target,
      profile,
      weights,
    });
    if (seq !== routeSeq) return; // a newer tap superseded this request
    if (res.type === 'route') {
      routeLayer.setRoute(res.route.geometry);
      const summary = t('route.summary', routeSummaryParams(getLocale(), res.route.distanceM, res.route.timeS));
      const risk = res.route.riskAvg > 0 ? ` · ${t(`route.risk.${riskClass(res.route.riskAvg)}`)}` : '';
      panel.setStatus(summary + risk);
    } else if (res.type === 'no-route') {
      panel.setStatus(t(routeErrorKey(res.reason)), true);
    } else if (res.type === 'error') {
      panel.setStatus(res.message, true);
    }
  }

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
      areaLoaded = true;
      panel.setCollapsed(true);
      picker = EMPTY;
      routeLayer.setPoints(picker);
      routeLayer.setRoute(null);
      panel.setStatus(
        `${t('area.loaded', { label: area.label, km: area.radiusKm })} · ${t('area.downloadHint', {
          mb: downloadMb(getLocale(), area.downloadGzipBytes),
        })} · ${t(hintKey(picker))}`,
      );
    } catch (err) {
      console.error(err);
      panel.setStatus(t(areaErrorKey(err)), true);
    } finally {
      panel.setBusy(false);
    }
  });
  const profilePanel = createProfilePanel(profile, (p) => {
    profile = p;
    saveProfile(storage, p);
    if (areaLoaded && wantsRoute(picker)) void computeRoute();
  });
  const weightsPanel = createWeightsPanel(weights, (w) => {
    weights = w;
    saveWeights(storage, w);
    clearTimeout(rerouteTimer);
    rerouteTimer = setTimeout(() => {
      if (areaLoaded && wantsRoute(picker)) void computeRoute();
    }, REROUTE_DEBOUNCE_MS);
  });
  ui.append(panel.root, profilePanel, weightsPanel);
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
