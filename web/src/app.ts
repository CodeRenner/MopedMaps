/** App wiring: data loading, router worker, map layers, panels. */

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { CLOSURES_URL, GRAPH_BASE_URL, OFFLINE_TILE_ERRORS, PLZ_TABLE_URL, REROUTE_DEBOUNCE_MS } from './config';
import { AreaError, loadArea } from './data/area';
import { type Manifest, parseManifest } from './data/manifest';
import { loadSearchData } from './data/places';
import { type ChunkStore, IdbStore, MemoryStore, type StoreName } from './data/store';
import { getLocale, t } from './i18n';
import { circleBounds, circlePolygon } from './location/circle';
import { PlzIndex } from './location/plz';
import { type RouterPort, WorkerRouterPort } from './router/port';
import type { CostWeights, VehicleProfile } from './router/profile';
import { type EnergySettings, estimateRange } from './router/range';
import { createAreaPanel } from './ui/areaPanel';
import { requestPersistence } from './ui/basemap';
import { areaErrorKey, downloadMb, energySummary, rangeSummary, routeErrorKey, routeSummaryParams } from './ui/messages';
import { createProfilePanel } from './ui/profilePanel';
import { createRouteChart } from './ui/routeChart';
import { loadEnergySettings, loadProfile, saveEnergySettings, saveProfile } from './ui/profileStore';
import { RoadsLayer } from './ui/roadsLayer';
import { RouteLayer } from './ui/routeLayer';
import { loadLastArea, saveLastArea } from './ui/areaStore';
import { createPlacesPanel } from './ui/placesPanel';
import { createSearchBox } from './ui/searchBox';
import type { SearchIndex } from './search/index';
import { addRecent, clearFavourite, loadPlaces, type Place, savePlaces, setFavourite } from './ui/placesStore';
import { showClosures } from './ui/closuresLayer';
import { createRouteControls } from './ui/routeControls';
import { createNavigation } from './nav/navigation';
import { type Closure, isActive } from './router/closures';
import type { LatLon, RouteResult } from './router/protocol';
import { EMPTY, hintKey, type PickerState, reverse, tap, wantsRoute } from './ui/routePicker';
import { speedBands } from './ui/speedBands';
import { loadWeights, riskClass, saveWeights } from './ui/weights';
import { createWeightsPanel } from './ui/weightsPanel';

async function fetchJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  // Static hosts may answer unknown paths with an HTML page (SPA fallback).
  const type = r.headers.get('content-type') ?? '';
  if (!type.includes('json')) throw new Error(`expected JSON from ${url}, got ${type || 'unknown'}`);
  return r.json();
}

/** Graph manifest; a missing build (404 / HTML fallback) means "no map data yet". */
async function loadManifest(): Promise<Manifest> {
  try {
    return parseManifest(await fetchJson(`${GRAPH_BASE_URL}/manifest.json`));
  } catch (err) {
    if (err instanceof TypeError) throw err; // network failure -> "no connection"
    throw new AreaError('no-tiles', String(err));
  }
}

async function openStore(name: StoreName = 'chunks'): Promise<ChunkStore> {
  try {
    return await IdbStore.open(indexedDB, name);
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
  const [plzTable, store, placesStore] = await Promise.all([fetchJson(PLZ_TABLE_URL), openStore(), openStore('places')]);
  const plz = new PlzIndex(plzTable as ConstructorParameters<typeof PlzIndex>[0]);
  const router: RouterPort = new WorkerRouterPort(
    new Worker(new URL('./router/worker.ts', import.meta.url), { type: 'module' }),
  );
  let manifest: Manifest | null = null;
  let areaLoaded = false;
  const basemapSources = new Set(Object.keys(map.getStyle().sources ?? {}));
  const roads = new RoadsLayer(map, router); // first: below the route and markers
  watchBasemap(map, roads, basemapSources);
  const routeLayer = new RouteLayer(map);
  const chart = createRouteChart();
  let picker: PickerState = EMPTY;
  let routeSeq = 0;
  const storage = safeLocalStorage();
  let profile: VehicleProfile = loadProfile(storage);
  const energyAccess = {
    get: (d: VehicleProfile['drive']) => loadEnergySettings(storage, d),
    set: (d: VehicleProfile['drive'], s: EnergySettings) => saveEnergySettings(storage, d, s),
  };
  let weights: CostWeights = loadWeights(storage);
  let places = loadPlaces(storage);
  const placeLabel = (p: LatLon): string => {
    const e = plz.nearest(p[0], p[1]);
    return e ? `${e.plz} ${e.name}` : `${p[0].toFixed(4)}, ${p[1].toFixed(4)}`;
  };
  let rerouteTimer: ReturnType<typeof setTimeout> | undefined;
  // Offline search over the loaded area's addresses and places.
  let searchIndex: SearchIndex | null = null;
  let searchedTarget: { p: LatLon; label: string } | null = null;
  const targetLabel = (p: LatLon): string =>
    searchedTarget && searchedTarget.p[0] === p[0] && searchedTarget.p[1] === p[1] ? searchedTarget.label : placeLabel(p);

  let currentRoute: RouteResult | null = null;
  const updateControls = () =>
    controls.update({ areaLoaded, hasStart: picker.start !== null, hasRoute: currentRoute !== null });
  const setPicker = (next: PickerState) => {
    if (next === picker) return; // e.g. a stray tap while a route is shown
    picker = next;
    routeLayer.setPoints(picker);
    placesPanel.render(places, picker.target !== null);
    void computeRoute();
  };
  /** Current position as a start (navigator.geolocation), or an error status. */
  const withLocation = (then: (p: LatLon) => void) => {
    if (!navigator.geolocation) return panel.setStatus(t('nav.noGps'), true);
    navigator.geolocation.getCurrentPosition(
      (pos) => then([pos.coords.latitude, pos.coords.longitude]),
      () => panel.setStatus(t('nav.noGps'), true),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
    );
  };
  /** Route to a place: from the current start, or from the GPS position. */
  const goToPlace = (place: Pick<Place, 'lat' | 'lon'>) => {
    const target: LatLon = [place.lat, place.lon];
    if (picker.start) setPicker({ start: picker.start, target });
    else {
      setPicker({ start: null, target }); // a map tap now sets the start
      withLocation((p) => setPicker({ start: p, target }));
    }
  };
  const placesPanel = createPlacesPanel({
    go: goToPlace,
    saveFavourite(key) {
      if (!picker.target) return;
      places = setFavourite(places, key, picker.target, placeLabel(picker.target), Date.now());
      savePlaces(storage, places);
      placesPanel.render(places, true);
    },
    clearFavourite(key) {
      places = clearFavourite(places, key);
      savePlaces(storage, places);
      placesPanel.render(places, picker.target !== null);
    },
  });
  placesPanel.render(places, false);
  const requestRoute = (from: LatLon, to: LatLon) =>
    router.request({ type: 'route', from, to, profile, weights });
  const navigation = createNavigation({
    map,
    async reroute(from) {
      if (!picker.target) return null;
      const res = await requestRoute(from, picker.target);
      return res.type === 'route' ? res.route : null;
    },
    showRoute(r, from) {
      picker = { start: from, target: picker.target };
      routeLayer.setPoints(picker);
      currentRoute = r;
      routeLayer.setRoute(r.geometry, speedBands(r.geometry, r.profile));
    },
    onExit: () => updateControls(),
    storage,
  });
  const controls = createRouteControls({
    onLocate() {
      withLocation((p) => setPicker({ start: p, target: picker.target }));
    },
    onReverse: () => setPicker(reverse(picker)),
    onNavigate() {
      if (currentRoute) navigation.start(currentRoute);
    },
    onCancel: () => setPicker(EMPTY),
  });
  document.body.append(controls.root);

  map.on('click', (ev) => {
    if (!areaLoaded) return;
    setPicker(tap(picker, [ev.lngLat.lat, ev.lngLat.lng]));
  });

  async function computeRoute(): Promise<void> {
    routeLayer.setRoute(null);
    chart.setProfile(null);
    currentRoute = null;
    updateControls();
    if (!wantsRoute(picker)) {
      panel.setStatus(t(hintKey(picker)));
      return;
    }
    const seq = ++routeSeq;
    panel.setStatus(t('route.computing'));
    const res = await requestRoute(picker.start, picker.target);
    if (seq !== routeSeq) return; // a newer tap superseded this request
    if (res.type === 'route') {
      routeLayer.setRoute(res.route.geometry, speedBands(res.route.geometry, res.route.profile));
      currentRoute = res.route;
      updateControls();
      places = addRecent(places, picker.target, targetLabel(picker.target), Date.now());
      savePlaces(storage, places);
      placesPanel.render(places, true);
      chart.setProfile(res.route.profile);
      const summary = t('route.summary', routeSummaryParams(getLocale(), res.route.distanceM, res.route.timeS));
      const r = res.route;
      const risk = r.riskAvg > 0 ? ` · ${t(`route.risk.${riskClass(r.riskAvg)}`)}` : '';
      // Energy shown calibrated to the user's real consumption (if given), plus range with a capacity.
      const es = energyAccess.get(profile.drive);
      const est = estimateRange(profile, es, r);
      const electric = profile.drive === 'electric';
      const en = energySummary(getLocale(), profile.drive, electric ? est.used : 0, electric ? 0 : est.used, r.ascentM);
      const range = rangeSummary(getLocale(), profile.drive, est, es.reserveShare);
      const rangeText = range ? ` · ${t(range.key, range.params)}` : '';
      const warning = range?.warning ? ` · ${t(range.warning.key, range.warning.params)}` : '';
      panel.setStatus(`${summary}${risk} · ${t(en.key, en.params)}${rangeText}${warning}`, !!range?.warning);
    } else if (res.type === 'no-route') {
      panel.setStatus(t(routeErrorKey(res.reason)), true);
    } else if (res.type === 'error') {
      panel.setStatus(res.message, true);
    }
  }

  const searchBox = createSearchBox({
    search(q) {
      const c = map.getCenter();
      return searchIndex?.search(q, [c.lat, c.lng]) ?? [];
    },
    pick(r) {
      const p: LatLon = [r.lat, r.lon];
      searchedTarget = { p, label: r.detail ? `${r.label}, ${r.detail}` : r.label };
      map.easeTo({ center: [r.lon, r.lat], zoom: Math.max(map.getZoom(), 14) });
      goToPlace(r);
    },
  });
  const loadSearch = async (files: string[]): Promise<void> => {
    searchBox.setState('loading');
    try {
      searchIndex = await loadSearchData(files, { baseUrl: GRAPH_BASE_URL, store: placesStore });
    } catch (err) {
      console.warn('search data unavailable', err);
      searchIndex = null;
    }
    searchBox.setState(searchIndex ? 'ready' : 'unavailable');
  };

  const loadAreaFor = async (code: string, radiusKm: number): Promise<void> => {
    panel.setBusy(true);
    try {
      manifest ??= await loadManifest();
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
      roads.refresh();
      void loadSearch(area.files);
      void loadClosures();
      saveLastArea(storage, { plz: code, radiusKm: area.radiusKm });
      // Keep downloaded graph chunks from being evicted (best effort, iOS may still clear).
      void requestPersistence(navigator.storage);
      panel.setCollapsed(true);
      picker = EMPTY;
      currentRoute = null;
      routeLayer.setPoints(picker);
      updateControls();
      routeLayer.setRoute(null);
      chart.setProfile(null);
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
  };
  // Daily road closures (closures.json, built by the deploy workflow). Optional:
  // offline or missing -> route without them.
  async function loadClosures(): Promise<void> {
    try {
      const res = await fetch(CLOSURES_URL);
      if (!res.ok) return;
      const doc = (await res.json()) as { closures?: Closure[] };
      const now = new Date();
      const active = (doc.closures ?? []).filter((c) => isActive(c, now));
      await router.request({ type: 'closures', closures: active, now: now.getTime() });
      showClosures(map, active);
      if (wantsRoute(picker)) void computeRoute();
    } catch {
      // network/parse error: keep routing without closures
    }
  }

  const panel = createAreaPanel(plz, (code, radiusKm) => void loadAreaFor(code, radiusKm));
  const profilePanel = createProfilePanel(profile, (p) => {
    profile = p;
    saveProfile(storage, p);
    if (areaLoaded && wantsRoute(picker)) void computeRoute();
  }, energyAccess);
  const weightsPanel = createWeightsPanel(weights, (w) => {
    weights = w;
    saveWeights(storage, w);
    clearTimeout(rerouteTimer);
    rerouteTimer = setTimeout(() => {
      if (areaLoaded && wantsRoute(picker)) void computeRoute();
    }, REROUTE_DEBOUNCE_MS);
  });
  ui.append(panel.root, searchBox.root, placesPanel.root, chart.root, profilePanel, weightsPanel);

  // Reopen the last area: its chunks are usually still in IndexedDB, so this is
  // fast and works offline; if they were evicted they are downloaded again.
  const last = loadLastArea(storage);
  if (last) {
    panel.setValues(last.plz, last.radiusKm);
    void loadAreaFor(last.plz, last.radiusKm);
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Switch the offline street map on while the basemap is unusable: local
 * fallback style (style JSON unreachable), browser offline, or repeated tile
 * errors (style cached by the service worker but tiles not).
 */
function watchBasemap(map: MapLibreMap, roads: RoadsLayer, basemapSources: Set<string>): void {
  let tileErrors = 0;
  let note: HTMLElement | null = null;
  const update = () => {
    const down = document.body.dataset.basemap === 'offline' || !navigator.onLine || tileErrors >= OFFLINE_TILE_ERRORS;
    roads.setActive(down);
    if (down && !note) {
      document.querySelector('.offline-note')?.remove(); // replaces the plain fallback note
      note = document.createElement('p');
      note.className = 'offline-note';
      note.textContent = t('map.offlineRoads');
      document.body.append(note);
    } else if (!down && note) {
      note.remove();
      note = null;
    }
  };
  map.on('error', (ev) => {
    const sourceId = (ev as { sourceId?: string }).sourceId;
    if (sourceId && basemapSources.has(sourceId)) {
      tileErrors++;
      update();
    }
  });
  window.addEventListener('offline', update);
  window.addEventListener('online', () => {
    tileErrors = 0;
    update();
  });
  update();
}
