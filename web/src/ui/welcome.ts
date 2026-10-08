/**
 * One-time notice on first start (safety + device-specific tips), accepted
 * once per device. Bump WELCOME_VERSION to show it again after important changes.
 */

import { t } from '../i18n';
import type { KeyValueStorage } from './profileStore';

export const WELCOME_STORAGE_KEY = 'mopedmaps.welcome';
export const WELCOME_VERSION = 1;

export type Platform = 'ios' | 'android' | 'desktop';

/** Coarse platform from the user agent (iPadOS reports "Macintosh" + touch). */
export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function welcomeAccepted(storage: KeyValueStorage | null): boolean {
  try {
    return Number(storage?.getItem(WELCOME_STORAGE_KEY)) >= WELCOME_VERSION;
  } catch {
    return false;
  }
}

export function acceptWelcome(storage: KeyValueStorage | null): void {
  try {
    storage?.setItem(WELCOME_STORAGE_KEY, String(WELCOME_VERSION));
  } catch {
    // storage blocked: the notice shows again next time
  }
}

/** i18n keys of the notice items for a platform (general first, then device tips). */
export function welcomeItems(p: Platform): string[] {
  const general = ['welcome.safety', 'welcome.noWarranty', 'welcome.privacy'];
  const device: Record<Platform, string[]> = {
    ios: ['welcome.ios.install', 'welcome.ios.screen', 'welcome.ios.voice'],
    android: ['welcome.android.install', 'welcome.android.battery'],
    desktop: ['welcome.desktop.plan'],
  };
  return [...general, ...device[p]];
}

/** Show the notice if not accepted yet; resolves once accepted (or immediately). */
export function showWelcomeIfNeeded(storage: KeyValueStorage | null, platform: Platform): Promise<void> {
  if (welcomeAccepted(storage)) return Promise.resolve();
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'welcome-overlay';
    const box = document.createElement('div');
    box.className = 'welcome';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'welcome-title');
    const h = document.createElement('h2');
    h.id = 'welcome-title';
    h.textContent = t('welcome.title');
    const list = document.createElement('ul');
    for (const key of welcomeItems(platform)) {
      const li = document.createElement('li');
      li.textContent = t(key);
      list.append(li);
    }
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = t('welcome.accept');
    ok.addEventListener('click', () => {
      acceptWelcome(storage);
      overlay.remove();
      resolve();
    });
    box.append(h, list, ok);
    overlay.append(box);
    document.body.append(overlay);
    ok.focus();
  });
}
