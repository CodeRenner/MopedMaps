/**
 * Data attributions that must be visible in the UI (CLAUDE.md compliance).
 * The basemap style brings its own attribution via MapLibre; these cover the
 * data the app itself uses.
 */

export const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (ODbL)';
export const GEONAMES_ATTRIBUTION =
  'PLZ: <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> (CC BY 4.0)';
export const ELEVATION_ATTRIBUTION =
  'Höhen: <a href="https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model" target="_blank" rel="noopener">Copernicus DEM GLO-30</a> (© DLR e.V., © Airbus DS, ESA/EU)';

export function appAttributions(): string[] {
  return [OSM_ATTRIBUTION, GEONAMES_ATTRIBUTION, ELEVATION_ATTRIBUTION];
}
