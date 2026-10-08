import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { findRoute } from '../../src/router/astar';
import { AccessFlag, decodeChunk, RoadClass } from '../../src/router/chunk';
import { assembleGraph, nearestNode } from '../../src/router/graph';

const DIR = join(__dirname, '..', '..', '..', 'data', 'tiles-germany');
const RC = Object.fromEntries(Object.entries(RoadClass).map(([k, v]) => [v, k.toLowerCase()]));
const dump: Record<string, [number, number, string][]> = {};
it('user routes', () => {
  const g = assembleGraph(['190_30', '190_31', '191_30', '191_31', '192_30', '192_31'].map((t) => decodeChunk(readFileSync(join(DIR, `${t}.mmg`)))));
  const start = nearestNode(g, 48.004998, 7.849204);
  const goals: [string, number, number][] = [['Tiengener x Basler Landstr', 47.980585, 7.792505], ['Elsaesser x Wirthstr', 48.023303, 7.812771]];
  for (const vmax of [45, 25]) for (const [name, lat, lon] of goals) {
    console.log(`\n=== ${name} (vmax ${vmax})`);
    for (const risk of [0, 0.5, 1, 1.5, 3]) {
      const r = findRoute(g, start, nearestNode(g, lat, lon), { vmaxKmh: vmax, drive: 'electric' }, { time: 1, risk, energy: 0 })!;
      const segs: [string, number, number, number][] = []; // key, len, lat, lon
      for (const a of r.arcs) {
        const e = g.edges[g.arcEdge[a]!]!;
        const lim = (g.arcForward[a] === 1 ? e.maxspeedFwd : e.maxspeedBwd) ?? 0;
        const key = `${RC[e.roadClass]}${lim || '?'}${e.flags & AccessFlag.MOTORROAD ? 'KFS' : ''}`;
        const last = segs[segs.length - 1];
        if (last && last[0] === key) last[1] += e.lengthM;
        else { const v = g.arcTarget[a]!; segs.push([key, e.lengthM, g.lat[v]!, g.lon[v]!]); }
      }
      // drop tiny segments (<120 m) by merging into neighbours for readability
      const out = segs.filter((s) => s[1] >= 120).map((s) => `${s[0]} ${(s[1] / 1000).toFixed(1)}@${s[2].toFixed(4)},${s[3].toFixed(4)}`);
      dump[`${name}|${vmax}|${risk}|${process.env.TAG}`] = r.arcs.map((a) => { const e = g.edges[g.arcEdge[a]!]!; const v = g.arcTarget[a]!; const lim = (g.arcForward[a] === 1 ? e.maxspeedFwd : e.maxspeedBwd) ?? 0; return [g.lat[v]!, g.lon[v]!, `${RC[e.roadClass]}${lim || '?'}${e.flags & AccessFlag.MOTORROAD ? 'KFS' : ''}|${e.lengthM}`]; });
      console.log(`b=${risk}: ${(r.distanceM / 1000).toFixed(1)} km ${(r.timeS / 60).toFixed(1)} min risk ${r.riskAvg.toFixed(0)}`);
      console.log('   ' + out.join(' > '));
    }
  }
  writeFileSync('/private/tmp/claude-502/-Users-ai-Desktop-Projects-MopedMaps/cc79c993-ecdd-4ee1-bc5e-46f27c110262/scratchpad/routes-' + process.env.TAG + '.json', JSON.stringify(dump));
});
