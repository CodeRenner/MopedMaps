import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeChunk, tileName, tileOf } from '../src/router/chunk';

const DIR = join(__dirname, 'fixtures');
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function closeTo(a: unknown, b: unknown): void {
  if (typeof b === 'number') {
    expect(a).toBeCloseTo(b, 7);
  } else if (Array.isArray(b)) {
    expect(Array.isArray(a)).toBe(true);
    expect((a as unknown[]).length).toBe(b.length);
    b.forEach((x, i) => closeTo((a as unknown[])[i], x));
  } else {
    expect(a).toEqual(b);
  }
}

describe('decodeChunk matches the Python reference decoder', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.mmg'));
  it('has fixtures', () => expect(files.length).toBeGreaterThan(0));

  for (const f of files) {
    it(f, () => {
      const chunk = decodeChunk(readFileSync(join(DIR, f)));
      const want = JSON.parse(readFileSync(join(DIR, `${f}.json`), 'utf8'));
      closeTo(chunk.key, want.key);
      expect(chunk.tileSize).toBe(want.tileSize);
      closeTo(chunk.nodes, want.nodes);
      if (want.heights) expect(chunk.heights).toEqual(want.heights);
      else expect(chunk.heights.every((h) => h === null)).toBe(true); // v1 fixture
      expect(chunk.edges.length).toBe(want.edges.length);
      chunk.edges.forEach((e, i) => {
        for (const [k, val] of Object.entries(want.edges[i] as Record<string, unknown>)) {
          closeTo((e as unknown as Record<string, unknown>)[camel(k)], val);
        }
      });
    });
  }
});

describe('tiles', () => {
  it('computes keys and names like the pipeline', () => {
    expect(tileOf(53.07, 8.81, 0.25)).toEqual([35, 212]);
    expect(tileOf(-0.1, -0.1, 0.25)).toEqual([-1, -1]);
    expect(tileName([35, 212])).toBe('212_35.mmg');
  });

  it('rejects bad magic', () => {
    expect(() => decodeChunk(new Uint8Array(32))).toThrow(/unsupported/);
  });
});

describe('format versions', () => {
  it('decodes v1 (no heights) and v2 with heights', () => {
    const v1 = decodeChunk(readFileSync(join(DIR, 'v1_small_212_35.mmg')));
    const v2 = decodeChunk(readFileSync(join(DIR, 'small_dem_212_35.mmg')));
    expect(v1.heights.every((h) => h === null)).toBe(true);
    expect(v2.heights.every((h) => typeof h === 'number')).toBe(true);
    expect(v2.nodes).toEqual(v1.nodes);
  });
});
