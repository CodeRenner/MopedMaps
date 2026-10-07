/** Draw markers and the route line on the map. */

import { type GeoJSONSource, type Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { LatLon } from '../router/protocol';
import type { PickerState } from './routePicker';

const SRC = 'route';
const EMPTY_LINE = { type: 'FeatureCollection' as const, features: [] };

export class RouteLayer {
  private readonly startMarker = new Marker({ color: '#2f855a' });
  private readonly targetMarker = new Marker({ color: '#c53030' });

  constructor(private readonly map: MapLibreMap) {
    map.addSource(SRC, { type: 'geojson', data: EMPTY_LINE });
    map.addLayer({
      id: 'route-casing', type: 'line', source: SRC,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#fff', 'line-width': 9 },
    });
    map.addLayer({
      id: 'route-line', type: 'line', source: SRC,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#2b6cb0', 'line-width': 5 },
    });
  }

  setPoints(s: PickerState): void {
    place(this.startMarker, s.start, this.map);
    place(this.targetMarker, s.target, this.map);
  }

  setRoute(geometry: LatLon[] | null): void {
    const src = this.map.getSource<GeoJSONSource>(SRC);
    if (!src) return;
    src.setData(
      geometry
        ? {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: geometry.map(([lat, lon]) => [lon, lat]) },
          }
        : EMPTY_LINE,
    );
  }
}

function place(m: Marker, p: LatLon | null, map: MapLibreMap): void {
  if (p) m.setLngLat([p[1], p[0]]).addTo(map);
  else m.remove();
}
