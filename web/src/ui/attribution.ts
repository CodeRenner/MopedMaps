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

const DL_BY = '<a href="https://www.govdata.de/dl-de/by-2-0" target="_blank" rel="noopener">dl-de/by-2-0</a>';
export const CLOSURES_ATTRIBUTION =
  'Sperrungen: <a href="https://mobidata-bw.de/dataset/baustelleninformationen-baden-wurttemberg" target="_blank" rel="noopener">MobiData BW</a>, ' +
  '<a href="https://www.freiburg.de/pb/231323.html" target="_blank" rel="noopener">Stadt Freiburg</a>, ' +
  '<a href="https://www.list.smwa.sachsen.de/" target="_blank" rel="noopener">Baustelleninformationssystem Sachsen (LISt)</a>, ' +
  '<a href="https://geobasis-bb.de/" target="_blank" rel="noopener">Landesbetrieb Straßenwesen Brandenburg</a>, ' +
  `<a href="https://viz.berlin.de/" target="_blank" rel="noopener">VIZ Berlin</a> (${DL_BY})`;

const CC_BY = '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>';
const DL_ZERO = '<a href="https://www.govdata.de/dl-de/zero-2-0" target="_blank" rel="noopener">dl-de/zero-2-0</a>';
export const TRAFFIC_ATTRIBUTION =
  'Verkehrsmengen (bearbeitet): <a href="https://mobidata-bw.de/dataset/karte_strassenverkehrszaehlung" target="_blank" rel="noopener">Verkehrsministerium BW</a>, ' +
  `<a href="https://www.list.smwa.sachsen.de/" target="_blank" rel="noopener">LASuV Sachsen</a>, <a href="https://geobasis-bb.de/" target="_blank" rel="noopener">LS Brandenburg</a>, FHH Hamburg BVM (${DL_BY}); ` +
  `Datenquelle: <a href="https://www.baysis.bayern.de/" target="_blank" rel="noopener">Bayerische Straßenbauverwaltung – BAYSIS</a> (${CC_BY}); ` +
  `SenMVKU Berlin (${DL_ZERO})`;

export function appAttributions(): string[] {
  return [OSM_ATTRIBUTION, GEONAMES_ATTRIBUTION, ELEVATION_ATTRIBUTION, TRAFFIC_ATTRIBUTION, CLOSURES_ATTRIBUTION];
}
