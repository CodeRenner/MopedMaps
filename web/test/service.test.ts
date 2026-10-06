import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RouterResponse } from '../src/router/protocol';
import { RouterService } from '../src/router/service';

const buf = (f: string): ArrayBuffer => {
  const b = readFileSync(join(__dirname, 'fixtures', f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const MOFA = { vmaxKmh: 25, drive: 'electric' as const };
const MOPED = { vmaxKmh: 45, drive: 'combustion' as const };

describe('RouterService', () => {
  it('reports no-graph before loading', () => {
    const s = new RouterService();
    const r = s.handle({ type: 'route', id: 1, from: [53.075, 8.8], to: [53.07, 8.82], profile: MOPED });
    expect(r).toEqual({ type: 'no-route', id: 1, reason: 'no-graph' });
  });

  it('loads chunks and routes', () => {
    const s = new RouterService();
    expect(s.handle({ type: 'load', id: 1, chunks: [buf('small_212_35.mmg')] })).toEqual({
      type: 'loaded', id: 1, nodeCount: 5, edgeCount: 4,
    });
    const r = s.handle({ type: 'route', id: 2, from: [53.0751, 8.8001], to: [53.0701, 8.8199], profile: MOFA });
    expect(r.type).toBe('route');
    const route = (r as Extract<RouterResponse, { type: 'route' }>).route;
    expect(route.geometry[0]).toEqual([53.075, 8.8]);
    expect(route.distanceM).toBeGreaterThan(1500);
  });

  it('distinguishes unreachable and off-network', () => {
    const s = new RouterService();
    s.handle({ type: 'load', id: 1, chunks: [buf('small_212_35.mmg')] });
    const base = { type: 'route' as const, profile: MOPED };
    expect(s.handle({ ...base, id: 2, from: [53.075, 8.8], to: [53.07, 8.82] })).toMatchObject({
      reason: 'unreachable',
    });
    expect(s.handle({ ...base, id: 3, from: [53.2, 8.8], to: [53.07, 8.82] })).toMatchObject({
      reason: 'start-off-network',
    });
    expect(s.handle({ ...base, id: 4, from: [53.075, 8.8], to: [53.0, 8.82] })).toMatchObject({
      reason: 'target-off-network',
    });
  });

  it('returns protocol errors instead of throwing', () => {
    const s = new RouterService();
    expect(s.handle({ type: 'load', id: 5, chunks: [new ArrayBuffer(32)] })).toMatchObject({
      type: 'error', id: 5,
    });
    s.handle({ type: 'load', id: 6, chunks: [buf('small_212_35.mmg')] });
    expect(
      s.handle({ type: 'route', id: 7, from: [53.075, 8.8], to: [53.07, 8.82], profile: { vmaxKmh: -1, drive: 'electric' } }),
    ).toMatchObject({ type: 'error', id: 7 });
  });
});
