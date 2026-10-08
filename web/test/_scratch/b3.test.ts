import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { AccessFlag, decodeChunk, RoadClass } from '../../src/router/chunk';
import { assembleGraph } from '../../src/router/graph';

const DIR = join(__dirname, '..', '..', '..', 'data', 'tiles-germany');
const tiles = ['191_30', '191_31', '192_31'];
const RC = Object.fromEntries(Object.entries(RoadClass).map(([k, v]) => [v, k]));
it('main roads around Freiburg', () => {
  const g = assembleGraph(tiles.map((t) => decodeChunk(readFileSync(join(DIR, `${t}.mmg`)))));
  // aggregate primary/trunk edges by 0.005° cell: class, limits, flags, risk
  const cells = new Map<string, { len: number; info: Set<string> }>();
  g.edges.forEach((e, i) => {
    if (e.roadClass > RoadClass.PRIMARY && e.roadClass !== RoadClass.TRUNK) return;
    if (e.roadClass === RoadClass.MOTORWAY) return;
    const lat = g.lat[g.edgeFrom[i]!]!;
    const lon = g.lon[g.edgeFrom[i]!]!;
    if (lat < 47.93 || lat > 48.04 || lon < 7.72 || lon > 7.9) return;
    const key = `${(Math.floor(lat / 0.005) * 0.005).toFixed(3)},${(Math.floor(lon / 0.01) * 0.01).toFixed(2)}`;
    const c = cells.get(key) ?? { len: 0, info: new Set() };
    c.len += e.lengthM;
    const fl = [e.flags & AccessFlag.MOTORROAD ? 'KFS' : '', e.flags & AccessFlag.MOPED ? '' : 'noMoped', e.cycleway ? 'cw' : ''].filter(Boolean).join(',');
    c.info.add(`${RC[e.roadClass]} ${e.maxspeedFwd ?? '?'}/${e.maxspeedBwd ?? '?'} r${e.risk} sig${e.signals}${fl ? ' ' + fl : ''}`);
    cells.set(key, c);
  });
  [...cells.entries()].sort().forEach(([k, c]) => console.log(k, Math.round(c.len), [...c.info].slice(0, 6).join(' | ')));
});
