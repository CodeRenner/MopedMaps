import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { findRoute } from '../../src/router/astar';
import { decodeChunk, RoadClass } from '../../src/router/chunk';
import { assembleGraph, nearestNode } from '../../src/router/graph';

const DIR = join(__dirname, '..', '..', '..', 'data', 'tiles-germany');
const prof = { vmaxKmh: 45, drive: 'electric' } as const;
it('suite', () => {
  const g = assembleGraph(['190_30', '190_31', '191_30', '191_31', '192_30', '192_31'].map((t) => decodeChunk(readFileSync(join(DIR, `${t}.mmg`)))));
  const START = nearestNode(g, 48.004998, 7.849204);
  // share of route length on roads matching pred
  const share = (r: NonNullable<ReturnType<typeof findRoute>>, pred: (cls: number, lim: number) => boolean) => {
    let m = 0;
    for (const a of r.arcs) { const e = g.edges[g.arcEdge[a]!]!; const lim = (g.arcForward[a] === 1 ? e.maxspeedFwd : e.maxspeedBwd) ?? 0; if (pred(e.roadClass, lim)) m += e.lengthM; }
    return m / r.distanceM;
  };
  const bundes50 = (c: number, l: number) => (c === RoadClass.TRUNK || c === RoadClass.PRIMARY) && l >= 50;
  const main = (c: number) => c <= RoadClass.TERTIARY;
  const res = (c: number) => c >= RoadClass.UNCLASSIFIED;
  const cases: [string, [number, number], [number, number], (r: any, b: number) => string][] = [
    ['R1 Tiengener', [48.004998, 7.849204], [47.980585, 7.792505], (r, b) => `B3/50+ ${(share(r, bundes50) * 100).toFixed(0)}%` + (b >= 1 ? (share(r, bundes50) < 0.15 ? ' ok' : ' FAIL(want off B3)') : '')],
    ['R2 Elsaesser', [48.004998, 7.849204], [48.023303, 7.812771], (r, b) => `main ${(share(r, (c) => main(c)) * 100).toFixed(0)}%` + (b <= 1.5 ? (share(r, (c) => main(c)) > 0.8 ? ' ok' : ' FAIL(want main roads)') : '')],
    ['Z Europa-Zaehringen', [47.9993, 7.8531], [48.0270, 7.8650], (r, b) => `residential ${(share(r, (c) => res(c)) * 100).toFixed(0)}%` + (b <= 0.5 ? (share(r, (c) => res(c)) < 0.5 ? ' ok' : ' FAIL(want B3/30)') : '')],
  ];
  void START;
  for (const [name, a, z, judge] of cases) {
    const s = nearestNode(g, a[0], a[1]); const t = nearestNode(g, z[0], z[1]);
    const line = [0, 0.5, 1, 1.5, 3].map((b) => { const r = findRoute(g, s, t, prof, { time: 1, risk: b, energy: 0 })!; return `b${b}: ${(r.timeS / 60).toFixed(1)}min ${judge(r, b)}`; });
    console.log(`${name.padEnd(20)} ${line.join(' | ')}`);
  }
});
