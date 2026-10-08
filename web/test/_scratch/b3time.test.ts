import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { findRoute } from '../../src/router/astar';
import { decodeChunk, RoadClass } from '../../src/router/chunk';
import { assembleGraph, nearestNode } from '../../src/router/graph';
import { speedKmh } from '../../src/router/profile';

const DIR = join(__dirname, '..', '..', '..', 'data', 'tiles-germany');
it('b3 time breakdown', () => {
  const chunks = ['191_31', '192_31'].map((t) => decodeChunk(readFileSync(join(DIR, `${t}.mmg`))));
  const prof = { vmaxKmh: 45, drive: 'electric' } as const;
  const breakdown = (label: string, g: ReturnType<typeof assembleGraph>) => {
    const s = nearestNode(g, 47.9993, 7.8531);
    const t = nearestNode(g, 48.0270, 7.8650);
    const r = findRoute(g, s, t, prof, { time: 1, risk: 0, energy: 0 });
    if (!r) return console.log(label, 'no route');
    let drive = 0, sig = 0, edges = 0, curve = 0;
    for (const a of r.arcs) {
      const e = g.edges[g.arcEdge[a]!]!;
      drive += e.lengthM / (speedKmh(e, g.arcForward[a] === 1, prof) / 3.6);
      sig += e.signals; edges++; curve += e.curvatureDeg * 0.02;
    }
    console.log(`${label}: ${(r.distanceM / 1000).toFixed(2)} km, total ${(r.timeS / 60).toFixed(1)} min = drive ${(drive / 60).toFixed(1)} + signals ${sig} + junctions ${edges} + curves ${(curve / 60).toFixed(1)} min`);
  };
  breakdown('chosen ', assembleGraph(chunks));
  // only main roads (primary/trunk/secondary + short links) to force the B3
  const main = chunks.map((c) => ({ ...c, edges: c.edges.filter((e) => e.roadClass <= RoadClass.TERTIARY) }));
  breakdown('main only', assembleGraph(main));
});
