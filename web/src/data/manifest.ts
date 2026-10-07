/** Graph build manifest (written by the pipeline CLI as manifest.json). */

export interface ManifestTile {
  ix: number;
  iy: number;
  bytes: number;
  gzip_bytes: number;
  nodes: number;
  edges: number;
}

export interface Manifest {
  format: 'mmg';
  version: number;
  tile_size_deg: number;
  built_at: string;
  source: string;
  attribution: string;
  totals: Record<string, number>;
  /** keyed by file name, e.g. "212_35.mmg" */
  tiles: Record<string, ManifestTile>;
}

export function parseManifest(json: unknown): Manifest {
  const m = json as Manifest;
  if (!m || m.format !== 'mmg' || m.version !== 1 || typeof m.tiles !== 'object') {
    throw new Error('unsupported manifest');
  }
  if (!(m.tile_size_deg > 0)) throw new Error('manifest: bad tile size');
  return m;
}

/** Build identity used to invalidate cached chunks when the graph is rebuilt. */
export function buildId(m: Manifest): string {
  return `${m.version}:${m.built_at}`;
}
