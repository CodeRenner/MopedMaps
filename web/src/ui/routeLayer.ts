/** Draw markers and the route line on the map. */

import { type GeoJSONSource, type Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { LatLon } from '../router/protocol';
import type { PickerState } from './routePicker';
import type { BandSection } from './speedBands';

const SRC = 'route';
const BANDS = 'route-bands';
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
    // Fast sections on top of the blue line: > 50 km/h orange, > 70 km/h red.
    map.addSource(BANDS, { type: 'geojson', data: EMPTY_LINE });
    map.addLayer({
      id: 'route-bands', type: 'line', source: BANDS,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['match', ['get', 'band'], 'red', '#c53030', '#dd6b20'],
        'line-width': 5,
      },
    });
  }

  setPoints(s: PickerState): void {
    place(this.startMarker, s.start, this.map);
    place(this.targetMarker, s.target, this.map);
  }

  setRoute(geometry: LatLon[] | null, bands: BandSection[] = []): void {
    this.map.getSource<GeoJSONSource>(BANDS)?.setData({
      type: 'FeatureCollection',
      features: bands.map((b) => ({
        type: 'Feature' as const,
        properties: { band: b.band },
        geometry: { type: 'LineString' as const, coordinates: b.coords.map(([lat, lon]) => [lon, lat]) },
      })),
    });
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
