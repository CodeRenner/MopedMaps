import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { findRoute } from '../../src/router/astar';
import { AccessFlag, decodeChunk, RoadClass } from '../../src/router/chunk';
import { assembleGraph, nearestNode } from '../../src/router/graph';
import { speedKmh } from '../../src/router/profile';

const DIR = join(__dirname, '..', '..', '..', 'data', 'tiles-germany');
const tiles = ['190_30', '190_31', '191_30', '191_31', '191_32', '192_30', '192_31', '192_32'];
const RC = Object.fromEntries(Object.entries(RoadClass).map(([k, v]) => [v, k]));
const P = {
  europa: [47.9993, 7.8531], zaehringen: [48.0270, 7.8650], hbf: [47.9977, 7.8412],
  stgeorgen: [47.9700, 7.8050], haid: [47.9830, 7.8000], wendlingen: [47.9760, 7.7930], merzhausen: [47.9650, 7.8290], schallstadt: [47.9580, 7.7520], ebringen: [47.9580, 7.7760],
} as Record<string, [number, number]>;

it('freiburg scenarios', () => {
  const g = assembleGraph(tiles.map((t) => decodeChunk(readFileSync(join(DIR, `${t}.mmg`)))));
  const prof = { vmaxKmh: 45, drive: 'electric' } as const;
  const pairs: [string, string][] = [['europa', 'zaehringen'], ['hbf', 'zaehringen'], ['europa', 'haid'], ['europa', 'wendlingen'], ['europa', 'schallstadt'], ['hbf', 'ebringen'], ['merzhausen', 'haid']];
  for (const [a, b] of pairs) {
    const s = nearestNode(g, P[a]![0], P[a]![1]);
    const t = nearestNode(g, P[b]![0], P[b]![1]);
    console.log(`\n=== ${a} -> ${b}`);
    for (const risk of [0, 0.5, 1, 1.5, 3]) {
      const r = findRoute(g, s, t, prof, { time: 1, risk, energy: 0 })!;
      // group consecutive edges with same class/limit
      const segs: string[] = [];
      let cur = '';
      let len = 0;
      const share: Record<string, number> = {};
      for (const arc of r.arcs) {
        const e = g.edges[g.arcEdge[arc]!]!;
        const fwd = g.arcForward[arc] === 1;
        const lim = (fwd ? e.maxspeedFwd : e.maxspeedBwd) ?? 0;
        const key = `${RC[e.roadClass]}/${lim || '?'}${e.flags & AccessFlag.MOTORROAD ? '/KFS' : ''} r${e.risk}`;
        const k2 = `${RC[e.roadClass]}/${lim || '?'}`;
        share[k2] = (share[k2] ?? 0) + e.lengthM;
        if (key !== cur) {
          if (cur && len > 150) segs.push(`${cur} ${(len / 1000).toFixed(2)}km`);
          cur = key;
          len = 0;
        }
        len += e.lengthM;
        void speedKmh;
      }
      if (len > 150) segs.push(`${cur} ${(len / 1000).toFixed(2)}km`);
      const sh = Object.entries(share).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => `${k}:${(v / 1000).toFixed(1)}`).join(' ');
      console.log(`b=${risk}: ${(r.distanceM / 1000).toFixed(1)} km ${(r.timeS / 60).toFixed(1)} min riskAvg ${r.riskAvg.toFixed(0)} | ${sh}`);
      const fast = segs.filter((x) => /\/(6|7|8|9|1\d\d)/.test(x)); if (fast.length) console.log('   fast: ' + fast.join(' > '));
    }
  }
});
