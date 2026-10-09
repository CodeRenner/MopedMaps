/** MapLibre map setup. DOM code lives in src/ui only; the router stays pure. */

import { AttributionControl, Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl';
// MapLibre resolves its worker relative to its own module, which breaks when
// a bundler relocates the library (Vite dev pre-bundling). Point it at the
// emitted worker file explicitly.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BASEMAP_STYLE_URL, MAP_INITIAL_CENTER, MAP_INITIAL_ZOOM } from '../config';
import { appAttributions } from './attribution';

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
