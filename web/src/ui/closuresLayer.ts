/** Draw active road closures: red dashed lines (closed), orange areas (avoid). */

import type { Feature, FeatureCollection } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Closure } from '../router/closures';

const SRC = 'closures';

export function showClosures(map: MapLibreMap, closures: readonly Closure[]): void {
  const data: FeatureCollection = {
    type: 'FeatureCollection',
    features: closures.flatMap((c): Feature[] => {
      if (c.kind === 'closed' && c.line) {
        return [{
          type: 'Feature',
          properties: { kind: c.kind, label: c.label },
          geometry: { type: 'LineString', coordinates: c.line.map(([la, lo]) => [lo, la]) },
        }];
      }
      if (c.kind === 'avoid' && c.polygon) {
        return [{
          type: 'Feature',
          properties: { kind: c.kind, label: c.label },
          geometry: { type: 'Polygon', coordinates: [c.polygon.map(([la, lo]) => [lo, la])] },
        }];
      }
      return [];
    }),
  };
  const src = map.getSource<GeoJSONSource>(SRC);
  if (src) {
    src.setData(data);
    return;
  }
  map.addSource(SRC, { type: 'geojson', data });
  // Below the route so the route stays readable.
  const before = map.getLayer('route-casing') ? 'route-casing' : undefined;
  map.addLayer({
    id: 'closures-area', type: 'fill', source: SRC, filter: ['==', ['get', 'kind'], 'avoid'],
    paint: { 'fill-color': '#dd6b20', 'fill-opacity': 0.25 },
  }, before);
  map.addLayer({
    id: 'closures-line', type: 'line', source: SRC, filter: ['==', ['get', 'kind'], 'closed'],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': '#c53030', 'line-width': 4, 'line-dasharray': [1.5, 1.5] },
  }, before);
}
