import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { findRoute } from '../../src/router/astar';
import { decodeChunk } from '../../src/router/chunk';
import { assembleGraph, nearestNode } from '../../src/router/graph';
import { speedBands } from '../../src/ui/speedBands';
it('bremen bands', () => {
  const D = join(__dirname, '..', '..', '..', 'data', 'tiles-bremen');
  const g = assembleGraph(readdirSync(D).filter((f) => f.endsWith('.mmg')).map((f) => decodeChunk(readFileSync(join(D, f)))));
  for (const v of [45, 100]) {
    const r = findRoute(g, nearestNode(g, 53.0833, 8.8131), nearestNode(g, 53.1717, 8.6206), { vmaxKmh: v, drive: 'electric' }, { time: 1, risk: 0.5, energy: 0 })!;
    const lim: Record<number, number> = {};
    r.profile.limitKmh.forEach((l, i) => (lim[l] = (lim[l] ?? 0) + r.profile.distM[i + 1]! - r.profile.distM[i]!));
    console.log('BANDS', v, JSON.stringify(Object.fromEntries(Object.entries(lim).map(([k, m]) => [k, Math.round(m)]))), speedBands(r.geometry, r.profile).map((b) => `${b.band}@${b.coords[0]!.map((x) => x.toFixed(4)).join(',')}`).join(' '));
  }
});
