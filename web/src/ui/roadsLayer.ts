/**
 * Offline street map: draws the road network of the loaded area (from the
 * router's graph) when the basemap tiles are unavailable, so points can still
 * be set and routes followed without network.
 */

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { OFFLINE_ROADS_LIMIT } from '../config';
import type { RouterPort } from '../router/port';
import { maxClassForZoom, type RoadLines } from '../router/roads';

const SOURCE = 'graph-roads';

/** RoadLines (lat, lon) -> GeoJSON lines with a `rc` (road class) property. */
export function roadsToGeoJson(r: RoadLines): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let k = 0; k < r.classes.length; k++) {
    const coordinates: [number, number][] = [];
    for (let p = r.offsets[k]!; p < r.offsets[k + 1]!; p++) coordinates.push([r.coords[p * 2 + 1]!, r.coords[p * 2]!]);
    features.push({ type: 'Feature', properties: { rc: r.classes[k]! }, geometry: { type: 'LineString', coordinates } });
  }
  return { type: 'FeatureCollection', features };
}

const WIDTH = (major: number, minor: number) =>
  [
    'interpolate', ['linear'], ['zoom'],
    9, ['case', ['<=', ['get', 'rc'], 2], major * 0.4, minor * 0.3],
    16, ['case', ['<=', ['get', 'rc'], 4], major * 2, minor * 2],
  ] as unknown as number;

export class RoadsLayer {
  private active = false;
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly map: MapLibreMap,
    private readonly router: RouterPort,
  ) {
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'graph-roads-casing',
      type: 'line',
      source: SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
      paint: { 'line-color': '#9aa3ad', 'line-width': WIDTH(5, 3.5) },
    });
    map.addLayer({
      id: 'graph-roads',
      type: 'line',
      source: SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
      paint: {
        'line-color': ['match', ['get', 'rc'], [0, 1], '#f2a65a', [2, 3], '#f7d488', [4], '#fbeeb8', '#ffffff'],
        'line-width': WIDTH(3.5, 2),
      },
    });
    map.on('moveend', () => this.schedule());
  }

  /** Show or hide the offline road network. */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    for (const id of ['graph-roads-casing', 'graph-roads']) this.map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    if (on) this.refresh();
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Reload lines (after a new area was loaded or the view moved). */
  refresh(): void {
    if (!this.active) return;
    const seq = ++this.seq;
    const b = this.map.getBounds();
    void this.router
      .request({
        type: 'roads',
        bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()],
        maxClass: maxClassForZoom(this.map.getZoom()),
        limit: OFFLINE_ROADS_LIMIT,
      })
      .then((res) => {
        if (seq !== this.seq || res.type !== 'roads') return;
        (this.map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(roadsToGeoJson(res.roads));
      });
  }

  private schedule(): void {
    if (!this.active) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), 150);
  }
}
