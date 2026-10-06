import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeChunk } from '../src/router/chunk';
import { assembleGraph, type Graph, nearestNode } from '../src/router/graph';

const load = (f: string) => decodeChunk(readFileSync(join(__dirname, 'fixtures', f)));

function arcs(g: Graph, n: number): number[] {
  const out = [];
  for (let a = g.arcStart[n]!; a < g.arcStart[n + 1]!; a++) out.push(g.arcTarget[a]!);
  return out.sort();
}

describe('assembleGraph', () => {
  it('builds bidirectional arcs for two-way edges', () => {
    const g = assembleGraph([load('small_212_35.mmg')]);
    expect(g.nodeCount).toBe(5);
    expect(g.edges.length).toBe(4);
    expect(g.arcTarget.length).toBe(8); // all four edges are two-way
    // node ids follow sorted OSM ids: 1,2,3,4,5 -> 0..4; node 2 (id 1) links 1,3,4
    expect(arcs(g, 1)).toEqual([0, 2, 3]);
  });

  it('links edges across loaded tiles and respects oneway', () => {
    const g = assembleGraph([load('cross_tile_212_34.mmg'), load('cross_tile_213_35.mmg')]);
    expect(g.nodeCount).toBe(2);
    expect(g.edges.length).toBe(1);
    expect(arcs(g, 0)).toEqual([1]);
    expect(arcs(g, 1)).toEqual([]); // oneway=yes
    expect(g.arcForward[0]).toBe(1);
  });

  it('drops edges into tiles that are not loaded', () => {
    const g = assembleGraph([load('cross_tile_212_34.mmg')]);
    expect(g.edges.length).toBe(0);
  });

  it('rejects duplicate chunks', () => {
    const c = load('small_212_35.mmg');
    expect(() => assembleGraph([c, c])).toThrow(/duplicate/);
  });

  it('finds the nearest connected node', () => {
    const g = assembleGraph([load('small_212_35.mmg')]);
    expect(nearestNode(g, 53.0751, 8.8099)).toBe(1);
    const lonely = assembleGraph([load('cross_tile_212_34.mmg')]);
    expect(nearestNode(lonely, 53.2, 8.7)).toBe(-1);
  });
});
