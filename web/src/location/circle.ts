/** Geodesic circle as a GeoJSON polygon (for drawing the loaded area). Pure. */

import type { Feature, Polygon } from 'geojson';
import { EARTH_RADIUS_M } from '../router/geo';

export function circlePolygon(
  lat: number,
  lon: number,
  radiusKm: number,
  steps = 64,
): Feature<Polygon> {
  const d = (radiusKm * 1000) / EARTH_RADIUS_M;
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const brg = (2 * Math.PI * (i % steps)) / steps;
    const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(brg));
    const lon2 =
      lo +
      Math.atan2(
        Math.sin(brg) * Math.sin(d) * Math.cos(la),
        Math.cos(d) - Math.sin(la) * Math.sin(lat2),
      );
    ring.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

/** [[west, south], [east, north]] bounds of a circle, for fitBounds. */
export function circleBounds(lat: number, lon: number, radiusKm: number): [[number, number], [number, number]] {
  const ring = circlePolygon(lat, lon, radiusKm, 32).geometry.coordinates[0]!;
  const lons = ring.map((p) => p[0]!);
  const lats = ring.map((p) => p[1]!);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}
