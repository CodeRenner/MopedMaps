/** MapLibre map setup. DOM code lives in src/ui only; the router stays pure. */

import { AttributionControl, Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BASEMAP_STYLE_URL, MAP_INITIAL_CENTER, MAP_INITIAL_ZOOM } from '../config';
import { appAttributions } from './attribution';

export function createMap(container: HTMLElement): MapLibreMap {
  const map = new MapLibreMap({
    container,
    style: BASEMAP_STYLE_URL,
    center: MAP_INITIAL_CENTER,
    zoom: MAP_INITIAL_ZOOM,
    attributionControl: false,
  });
  map.addControl(
    new AttributionControl({ compact: true, customAttribution: appAttributions() }),
    'bottom-right',
  );
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  return map;
}
