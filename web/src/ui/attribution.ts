/**
 * Data attributions that must be visible in the UI (CLAUDE.md compliance).
 * The basemap style brings its own attribution via MapLibre; these cover the
 * data the app itself uses.
 */

export const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (ODbL)';
export const GEONAMES_ATTRIBUTION =
  'PLZ: <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> (CC BY 4.0)';
// Elevation source is added in roadmap step 6 (Copernicus DEM / SRTM).

export function appAttributions(): string[] {
  return [OSM_ATTRIBUTION, GEONAMES_ATTRIBUTION];
}
