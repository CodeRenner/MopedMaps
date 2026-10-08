import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { findRoute } from '../../src/router/astar';
import { decodeChunk } from '../../src/router/chunk';
import { assembleGraph, nearestNode } from '../../src/router/graph';
it('sim track', () => {
  const D = join(__dirname, '..', '..', '..', 'data', 'tiles-bremen');
  const g = assembleGraph(readdirSync(D).filter((f) => f.endsWith('.mmg')).map((f) => decodeChunk(readFileSync(join(D, f)))));
  const r = findRoute(g, nearestNode(g, 53.0833, 8.8131), nearestNode(g, 53.1717, 8.6206), { vmaxKmh: 45, drive: 'electric' }, { time: 1, risk: 0.5, energy: 0 })!;
  // resample every ~40 m
  const pts: [number, number][] = [];
  let acc = 0;
  for (let i = 1; i < r.geometry.length; i++) {
    const [a, b] = [r.geometry[i - 1]!, r.geometry[i]!];
    const d = Math.hypot((b[0] - a[0]) * 111195, (b[1] - a[1]) * 66900);
    acc += d;
    if (acc >= 12) { pts.push(b); acc = 0; }
  }
  // detour: after point 60, drift 150 m north-east for 6 fixes
  const det = pts.slice(200, 215).map(([la, lo]) => [la + 0.0014, lo + 0.0014] as [number, number]);
  const sim = [...pts.slice(0, 200), ...det, ...pts.slice(215)];
  writeFileSync(join(__dirname, '..', '..', 'public', '_sim.json'), JSON.stringify({ start: r.geometry[0], end: r.geometry[r.geometry.length - 1], pts: sim }));
  console.log('SIM', sim.length, r.geometry[0], r.geometry[r.geometry.length - 1]);
});
