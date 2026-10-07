/** PLZ input + radius slider panel. Thin DOM layer; logic lives elsewhere. */

import { DEFAULT_RADIUS_KM, MAX_RADIUS_KM, MIN_RADIUS_KM } from '../config';
import { t } from '../i18n';
import type { PlzIndex } from '../location/plz';

export interface AreaPanel {
  root: HTMLElement;
  setStatus(text: string, isError?: boolean): void;
  setBusy(busy: boolean): void;
  /** Collapse to the status line (after an area is loaded) or expand again. */
  setCollapsed(collapsed: boolean): void;
}

const RADIUS_STEP_KM = 5;

export function createAreaPanel(
  plz: PlzIndex,
  onSubmit: (plz: string, radiusKm: number) => void,
): AreaPanel {
  const root = document.createElement('form');
  root.className = 'panel';
  root.innerHTML = `
    <label class="row"><span></span>
      <input name="plz" inputmode="numeric" autocomplete="postal-code" list="plz-list" maxlength="40" required />
    </label>
    <datalist id="plz-list"></datalist>
    <label class="row"><span class="radius-label"></span>
      <input name="radius" type="range" />
    </label>
    <button type="submit"></button>
    <div class="status-row">
      <p class="status" role="status" aria-live="polite"></p>
      <button type="button" class="change" hidden></button>
    </div>`;
  const [plzLabel] = root.querySelectorAll('span');
  const plzInput = root.querySelector<HTMLInputElement>('input[name=plz]')!;
  const radius = root.querySelector<HTMLInputElement>('input[name=radius]')!;
  const radiusLabel = root.querySelector<HTMLElement>('.radius-label')!;
  const list = root.querySelector<HTMLDataListElement>('datalist')!;
  const button = root.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const change = root.querySelector<HTMLButtonElement>('button.change')!;
  change.textContent = t('area.change');
  const status = root.querySelector<HTMLElement>('.status')!;

  plzLabel!.textContent = t('area.plzLabel');
  plzInput.placeholder = t('area.plzPlaceholder');
  Object.assign(radius, {
    min: String(MIN_RADIUS_KM),
    max: String(MAX_RADIUS_KM),
    step: String(RADIUS_STEP_KM),
    value: String(DEFAULT_RADIUS_KM),
  });
  const showRadius = () => (radiusLabel.textContent = t('area.radiusLabel', { km: radius.value }));
  showRadius();
  radius.addEventListener('input', showRadius);
  button.textContent = t('area.load');

  plzInput.addEventListener('input', () => {
    list.replaceChildren(
      ...plz.search(plzInput.value, 8).map((e) => {
        const o = document.createElement('option');
        o.value = e.plz;
        o.label = `${e.plz} ${e.name}`;
        return o;
      }),
    );
  });

  change.addEventListener('click', () => {
    root.classList.remove('collapsed');
    change.hidden = true;
    plzInput.focus();
  });

  root.addEventListener('submit', (ev) => {
    ev.preventDefault();
    // Accept "28195", "28195 Bremen" or a place name (first match).
    const q = plzInput.value.trim();
    const code = /^\d{5}/.exec(q)?.[0] ?? plz.search(q, 1)[0]?.plz ?? q;
    onSubmit(code, Number(radius.value));
  });

  return {
    root,
    setStatus(text, isError = false) {
      status.textContent = text;
      status.classList.toggle('error', isError);
    },
    setBusy(busy) {
      button.disabled = busy;
    },
    setCollapsed(collapsed) {
      root.classList.toggle('collapsed', collapsed);
      change.hidden = !collapsed;
    },
  };
}
