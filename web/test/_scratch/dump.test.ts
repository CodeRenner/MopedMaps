import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { findRoute } from '../../src/router/astar';
import { AccessFlag, decodeChunk, RoadClass } from '../../src/router/chunk';
import { assembleGraph, nearestNode } from '../../src/router/graph';
import { applyClosures } from '../../src/router/closures';

// ROUTES env: JSON {name: [[lat,lon],[lat,lon]]}; B env: comma list of risk weights; VMAX; OUT file
const DIR = process.env.TILES ?? join(__dirname, '..', '..', '..', 'data', 'tiles-germany');
const RC = Object.fromEntries(Object.entries(RoadClass).map(([k, v]) => [v, k.toLowerCase()]));
it('dump', () => {
  const routes = JSON.parse(process.env.ROUTES!) as Record<string, [[number, number], [number, number]]>;
  const pts = Object.values(routes).flat();
  const lat0 = Math.min(...pts.map((p) => p[0])) - 0.15, lat1 = Math.max(...pts.map((p) => p[0])) + 0.15;
  const lon0 = Math.min(...pts.map((p) => p[1])) - 0.15, lon1 = Math.max(...pts.map((p) => p[1])) + 0.15;
  const files = readdirSync(DIR).filter((f) => f.endsWith('.mmg')).filter((f) => {
    const [iy, ix] = f.replace('.mmg', '').split('_').map(Number) as [number, number];
    return (iy + 1) * 0.25 > lat0 && iy * 0.25 < lat1 && (ix + 1) * 0.25 > lon0 && ix * 0.25 < lon1;
  });
  const g = assembleGraph(files.map((f) => decodeChunk(readFileSync(join(DIR, f)))));
  const vmax = Number(process.env.VMAX ?? 45);
  if (process.env.CLOSURES) { g.closures = applyClosures(g, JSON.parse(readFileSync(process.env.CLOSURES, 'utf8')).closures, new Date()); console.log('MATCHED', JSON.stringify(g.closures.matched)); }
  const out: Record<string, unknown> = {};
  for (const [name, [a, z]] of Object.entries(routes)) {
    const s = nearestNode(g, a[0], a[1]), t = nearestNode(g, z[0], z[1]);
    for (const b of (process.env.B ?? '0,0.5,1,1.5,3').split(',').map(Number)) {
      const r = findRoute(g, s, t, { vmaxKmh: vmax, drive: 'electric' }, { time: 1, risk: b, energy: 0 });
      if (!r) { out[`${name}|${vmax}|${b}`] = null; continue; }
      out[`${name}|${vmax}|${b}`] = {
        min: r.timeS / 60, km: r.distanceM / 1000, risk: r.riskAvg,
        pts: r.arcs.map((arc) => { const e = g.edges[g.arcEdge[arc]!]!; const v = g.arcTarget[arc]!; const lim = (g.arcForward[arc] === 1 ? e.maxspeedFwd : e.maxspeedBwd) ?? 0; return [g.lat[v]!, g.lon[v]!, `${RC[e.roadClass]}${lim || '?'}${e.flags & AccessFlag.MOTORROAD ? 'KFS' : ''}|${e.lengthM}`]; }),
      };
    }
  }
  writeFileSync(process.env.OUT!, JSON.stringify(out));
});
