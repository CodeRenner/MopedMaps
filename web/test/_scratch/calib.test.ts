import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import * as cfg from '../../src/config';
import { findRoute, type Route } from '../../src/router/astar';
import { decodeChunk } from '../../src/router/chunk';
import { assembleGraph, nearestNode, type Graph } from '../../src/router/graph';
import { runtimeRiskPerKm, speedKmh } from '../../src/router/profile';

const DIR = join(__dirname, '..', '..', '..', 'data', 'tiles-germany');
const prof = { vmaxKmh: 45, drive: 'electric' } as const;
function parts(g: Graph, r: Route) {
  let drive = 0, sig = 0, junc = 0, curve = 0, rStatic = 0, rRun = 0;
  const byCls: Record<string, number> = {};
  for (const a of r.arcs) {
    const e = g.edges[g.arcEdge[a]!]!; const fwd = g.arcForward[a] === 1; const km = e.lengthM / 1000;
    drive += e.lengthM / (speedKmh(e, fwd, prof) / 3.6); sig += e.signals;
    junc += cfg.JUNCTION_PENALTY_BY_CLASS_S[e.roadClass] ?? cfg.JUNCTION_PENALTY_S; curve += e.curvatureDeg * cfg.CURVATURE_PENALTY_S_PER_DEG;
    rStatic += e.risk * km; const kk = `c${e.roadClass}`; (globalThis as any).st ??= {}; (globalThis as any).st[kk] = ((globalThis as any).st[kk] ?? 0) + e.risk * km; const rr = runtimeRiskPerKm(e, fwd, prof) * km; rRun += rr;
    const k = `c${e.roadClass}/${(fwd ? e.maxspeedFwd : e.maxspeedBwd) ?? '?'}`; byCls[k] = (byCls[k] ?? 0) + rr;
  }
  const st = (globalThis as any).st; (globalThis as any).st = {};
  return `static by class ${JSON.stringify(Object.fromEntries(Object.entries(st).map(([k, v]) => [k, Math.round(v as number)])))} ${(r.distanceM / 1000).toFixed(2)}km drive ${drive.toFixed(0)}s sig ${sig}(${sig * cfg.SIGNAL_PENALTY_S}s) junc ${junc.toFixed(0)}s curve ${curve.toFixed(0)}s | risk static ${rStatic.toFixed(0)} runtime ${rRun.toFixed(0)} ${JSON.stringify(Object.fromEntries(Object.entries(byCls).filter(([, v]) => Math.abs(v) > 3).map(([k, v]) => [k, Math.round(v)])))}`;
}
it('calib', () => {
  const g = assembleGraph(['190_30', '190_31', '191_30', '191_31', '192_30', '192_31'].map((t) => decodeChunk(readFileSync(join(DIR, `${t}.mmg`)))));
  const s = nearestNode(g, 47.9993, 7.8531), t = nearestNode(g, 48.0270, 7.8650);
  const A = findRoute(g, s, t, prof, { time: 1, risk: 0, energy: 0 })!;
  const B = findRoute(g, s, t, prof, { time: 1, risk: 0.5, energy: 0 })!;
  console.log('A (B3)  ', parts(g, A)); console.log('B (user)', parts(g, B));
});
