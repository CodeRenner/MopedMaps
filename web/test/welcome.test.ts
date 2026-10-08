import { describe, expect, it } from 'vitest';
import { acceptWelcome, detectPlatform, WELCOME_STORAGE_KEY, welcomeAccepted, welcomeItems } from '../src/ui/welcome';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('welcome notice', () => {
  it('detects the platform', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15')).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5)).toBe('ios'); // iPadOS
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0)).toBe('desktop');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')).toBe('android');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
  });

  it('shows general items plus device tips', () => {
    expect(welcomeItems('ios')).toContain('welcome.ios.screen');
    expect(welcomeItems('android')).toContain('welcome.android.install');
    expect(welcomeItems('desktop')).not.toContain('welcome.ios.screen');
    for (const p of ['ios', 'android', 'desktop'] as const) expect(welcomeItems(p).slice(0, 3)).toEqual(['welcome.safety', 'welcome.noWarranty', 'welcome.privacy']);
  });

  it('is accepted once per device (versioned)', () => {
    const st = mem();
    expect(welcomeAccepted(st)).toBe(false);
    acceptWelcome(st);
    expect(welcomeAccepted(st)).toBe(true);
    st.setItem(WELCOME_STORAGE_KEY, '0'); // older version -> show again
    expect(welcomeAccepted(st)).toBe(false);
    expect(welcomeAccepted(null)).toBe(false);
  });
});
