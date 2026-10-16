/** MapLibre map setup. DOM code lives in src/ui only; the router stays pure. */

import { AttributionControl, Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl';
// MapLibre resolves its worker relative to its own module, which breaks when
// a bundler relocates the library (Vite dev pre-bundling). Point it at the
// emitted worker file explicitly.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { t } from '../i18n';
import { BASEMAP_STYLE_URL, MAP_INITIAL_CENTER, MAP_INITIAL_ZOOM } from '../config';
import { appAttributions, appVersion, bugReportUrl, REPO_URL } from './attribution';

export function createMap(container: HTMLElement): MapLibreMap {
  setWorkerUrl(maplibreWorkerUrl);
  const map = new MapLibreMap({
    container,
    style: BASEMAP_STYLE_URL,
    center: MAP_INITIAL_CENTER,
    zoom: MAP_INITIAL_ZOOM,
    attributionControl: false,
    // No label fade: with a moving navigation camera the fade keeps the map
    // redrawing at full frame rate (74 instead of ~26 fps measured), costing battery.
    fadeDuration: 0,
  });
  map.addControl(
    new AttributionControl({ compact: true, customAttribution: appAttributions() }),
    'bottom-right',
  );
  addAppInfo(container);
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  // With all data sources the attribution spans several lines; start it
  // collapsed behind MapLibre's (i) button instead of covering the map.
  collapseAttribution(container);
  map.once('load', () => collapseAttribution(container));
  return map;
}

export function collapseAttribution(container: HTMLElement): void {
  container.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact')?.classList.remove('maplibregl-compact-show');
}

/**
 * Version and feedback links as their own highlighted row at the top of the
 * expanded attribution (i), not mixed into the data credits. Lives next to
 * MapLibre's inner element, which MapLibre re-renders on every update.
 */
function addAppInfo(container: HTMLElement): void {
  const attrib = container.querySelector('.maplibregl-ctrl-attrib');
  if (!attrib) return;
  const row = document.createElement('div');
  row.className = 'app-info';
  const version = document.createElement('span');
  version.className = 'app-version';
  version.textContent = `MopedMaps ${appVersion()}`;
  const link = (text: string, href: string, cls: string) => {
    const a = document.createElement('a');
    a.className = cls;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = text;
    return a;
  };
  row.append(
    version,
    link(t('info.report'), bugReportUrl(appVersion()), 'app-info-btn primary'),
    link(t('info.source'), REPO_URL, 'app-info-btn'),
  );
  attrib.insertBefore(row, attrib.querySelector('.maplibregl-ctrl-attrib-inner'));
}
