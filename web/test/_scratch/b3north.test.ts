import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { decodeChunk, RoadClass } from '../../src/router/chunk';
import { assembleGraph } from '../../src/router/graph';
const DIR = join(__dirname, '..', '..', '..', 'data', 'tiles-germany');
it('b3 north limits', () => {
  const g = assembleGraph(['192_31'].map((t) => decodeChunk(readFileSync(join(DIR, `${t}.mmg`)))));
  // primary edges in the corridor Europaplatz (47.999) .. Zaehringen (48.03), lon 7.849..7.862
  const rows: [number, string][] = [];
  g.edges.forEach((e, i) => {
    if (e.roadClass !== RoadClass.PRIMARY) return;
    const la = g.lat[g.edgeFrom[i]!]!, lo = g.lon[g.edgeFrom[i]!]!;
    if (la < 47.999 || la > 48.032 || lo < 7.848 || lo > 7.866) return;
    rows.push([la, `${la.toFixed(4)},${lo.toFixed(4)} ${e.maxspeedFwd}/${e.maxspeedBwd} ${Math.round(e.lengthM)}m sig${e.signals} r${e.risk}`]);
  });
  rows.sort((a, b) => a[0] - b[0]);
  let last = '';
  for (const [, s] of rows) { const lim = s.split(' ')[1]; if (lim !== last) { console.log('ROW', s); last = lim!; } }
});
