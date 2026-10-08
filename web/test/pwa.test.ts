import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = join(__dirname, '..');
const PUB = join(WEB, 'public');

function pngSize(path: string): [number, number] {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('web app manifest', () => {
  const m = JSON.parse(readFileSync(join(PUB, 'manifest.webmanifest'), 'utf8'));

  it('has the fields browsers need for installation', () => {
    expect(m.name).toBeTruthy();
    expect(m.short_name.length).toBeLessThanOrEqual(12);
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('./');
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('references existing icons with the declared sizes, incl. 192, 512 and maskable', () => {
    for (const icon of m.icons) {
      const path = join(PUB, icon.src);
      expect(existsSync(path), icon.src).toBe(true);
      if (icon.type === 'image/png') {
        const [w, h] = pngSize(path);
        expect(`${w}x${h}`).toBe(icon.sizes);
      }
    }
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(m.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  });

  it('index.html links the manifest and iOS icon', () => {
    const html = readFileSync(join(WEB, 'index.html'), 'utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(pngSize(join(PUB, 'icons', 'apple-touch-icon.png'))).toEqual([180, 180]);
  });
});

describe('app update', async () => {
  const { reloadDecision } = await import('../src/sw/update');
  it('reloads once a new version took over, but not on first install or mid-navigation', () => {
    expect(reloadDecision(false, false)).toBe('no');
    expect(reloadDecision(true, false)).toBe('now');
    expect(reloadDecision(true, true)).toBe('later');
  });
});
