/**
 * Question after a navigated ride, to learn the real consumption
 * (router/learning.ts): battery % (electric) or full-to-full fill-ups
 * (combustion). Every variant offers "skip" and "don't ask again".
 */

import { LEARN_MIN_DROP_PCT } from '../config';
import { formatNumber, getLocale, t } from '../i18n';
import type { Prompt } from '../router/learning';
import { parsePositive } from './profileStore';

export type FeedbackAnswer =
  | { action: 'battery'; startPct: number; endPct: number; capacity: number }
  | { action: 'start' }
  | { action: 'ride'; litres: number | null }
  | { action: 'skip' }
  | { action: 'never' };

export interface FeedbackContext {
  prompt: Exclude<Prompt, 'none'>;
  rideKm: number;
  /** Still collecting the first samples (else: a periodic check). */
  learning: boolean;
  /** Known usable capacity (Wh); the battery question asks for it when null. */
  capacity: number | null;
  /** Combustion: navigated km since the last full tank, including this ride. */
  windowKm: number;
}

/** Parse a battery percentage ("80", " 42,5 %"); null if not within 0-100. */
export function parsePercent(input: string): number | null {
  const s = input.trim().replace('%', '').trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function field(label: string, name: string, value = ''): HTMLLabelElement {
  const l = document.createElement('label');
  l.className = 'learn-field';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.name = name;
  input.inputMode = 'decimal';
  input.value = value;
  l.append(span, input);
  return l;
}

function button(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

export function showRideFeedback(ctx: FeedbackContext): Promise<FeedbackAnswer> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'welcome-overlay';
    const box = document.createElement('div');
    box.className = 'welcome learn-dialog';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'learn-title');
    const h = document.createElement('h2');
    h.id = 'learn-title';
    const intro = document.createElement('p');
    const error = document.createElement('p');
    error.className = 'hint error';
    error.hidden = true;
    const done = (a: FeedbackAnswer) => {
      overlay.remove();
      resolve(a);
    };
    const loc = getLocale();
    const km = formatNumber(loc, ctx.rideKm, 1);
    const purpose = t(ctx.learning ? 'learn.purpose.learning' : 'learn.purpose.check');
    const fields: HTMLLabelElement[] = [];
    let primary: HTMLButtonElement;
    let skipText = t('learn.skip');
    const skipHint = document.createElement('p');
    skipHint.className = 'hint-muted';

    if (ctx.prompt === 'battery') {
      h.textContent = t('learn.battery.title');
      intro.textContent = `${t('learn.battery.text', { km })} ${purpose}`;
      const start = field(t('learn.battery.start'), 'start', '100');
      const end = field(t('learn.battery.end'), 'end');
      const cap = ctx.capacity === null ? field(t('profile.capacity.electric'), 'capacity') : null;
      fields.push(start, end, ...(cap ? [cap] : []));
      skipHint.textContent = t('learn.battery.skipHint');
      primary = button(t('learn.save'), 'primary', () => {
        const s = parsePercent(start.querySelector('input')!.value);
        const e = parsePercent(end.querySelector('input')!.value);
        const c = cap ? parsePositive(cap.querySelector('input')!.value) : ctx.capacity;
        if (s === null || e === null || s - e < LEARN_MIN_DROP_PCT || c === null) {
          error.textContent = t(c === null ? 'learn.error.capacity' : 'learn.error.percent', { n: LEARN_MIN_DROP_PCT });
          error.hidden = false;
          return;
        }
        done({ action: 'battery', startPct: s, endPct: e, capacity: c });
      });
    } else if (ctx.prompt === 'fuel-start') {
      h.textContent = t('learn.fuelStart.title');
      intro.textContent = `${t('learn.fuelStart.text')} ${purpose}`;
      skipText = t('learn.later');
      primary = button(t('learn.fuelStart.ok'), 'primary', () => done({ action: 'start' }));
    } else {
      h.textContent = t('learn.fuelRide.title');
      intro.textContent = t('learn.fuelRide.text', { km, total: formatNumber(loc, ctx.windowKm, 0) });
      const litres = field(t('learn.fuelRide.litres'), 'litres');
      fields.push(litres);
      skipText = t('learn.fuelRide.skip');
      skipHint.textContent = t('learn.fuelRide.skipHint');
      primary = button(t('learn.fuelRide.ok'), 'primary', () => {
        const raw = litres.querySelector('input')!.value;
        const l = parsePositive(raw);
        if (raw.trim() !== '' && l === null) {
          error.textContent = t('learn.error.litres');
          error.hidden = false;
          return;
        }
        done({ action: 'ride', litres: l });
      });
    }

    const actions = document.createElement('div');
    actions.className = 'learn-actions';
    actions.append(
      primary,
      button(skipText, 'secondary', () => done({ action: 'skip' })),
      button(t('learn.never'), 'secondary', () => done({ action: 'never' })),
    );
    box.append(h, intro, ...fields, error, actions);
    if (skipHint.textContent) box.append(skipHint);
    overlay.append(box);
    document.body.append(overlay);
    (box.querySelector<HTMLInputElement>('input[name=end], input[name=litres]') ?? primary).focus();
  });
}
