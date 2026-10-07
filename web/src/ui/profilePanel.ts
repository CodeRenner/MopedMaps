/** Collapsible vehicle settings: vmax presets + free input, drive type. */

import { MAX_VMAX_KMH, MIN_VMAX_KMH, VMAX_PRESETS_KMH } from '../config';
import { t } from '../i18n';
import type { Drive, VehicleProfile } from '../router/profile';
import { parseVmax } from './profileStore';

export function createProfilePanel(
  initial: VehicleProfile,
  onChange: (p: VehicleProfile) => void,
): HTMLElement {
  let profile = initial;
  const root = document.createElement('details');
  root.className = 'panel profile';
  root.innerHTML = `
    <summary></summary>
    <div class="presets" role="group"></div>
    <label class="row"><span class="vmax-label"></span>
      <input name="vmax" inputmode="decimal" />
    </label>
    <p class="hint error" hidden></p>
    <fieldset class="drive"><legend></legend></fieldset>`;
  const summary = root.querySelector('summary')!;
  const presets = root.querySelector<HTMLElement>('.presets')!;
  const vmaxInput = root.querySelector<HTMLInputElement>('input[name=vmax]')!;
  const hint = root.querySelector<HTMLElement>('.hint')!;
  const drive = root.querySelector('fieldset')!;

  root.querySelector('.vmax-label')!.textContent = t('profile.vmax');
  drive.querySelector('legend')!.textContent = t('profile.drive');

  const render = () => {
    summary.textContent = `${t('profile.title')}: ${t('profile.preset', { kmh: profile.vmaxKmh })}, ${t(
      `profile.drive.${profile.drive}`,
    )}`;
    vmaxInput.value = String(profile.vmaxKmh);
    presets.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.kmh) === profile.vmaxKmh));
    });
    drive.querySelectorAll('input').forEach((r) => (r.checked = r.value === profile.drive));
  };
  const update = (p: VehicleProfile) => {
    profile = p;
    hint.hidden = true;
    render();
    onChange(p);
  };

  for (const kmh of VMAX_PRESETS_KMH) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.kmh = String(kmh);
    b.textContent = t('profile.preset', { kmh });
    b.addEventListener('click', () => update({ ...profile, vmaxKmh: kmh }));
    presets.append(b);
  }
  vmaxInput.addEventListener('change', () => {
    const v = parseVmax(vmaxInput.value);
    if (v === null) {
      hint.textContent = t('profile.invalidVmax', { min: MIN_VMAX_KMH, max: MAX_VMAX_KMH });
      hint.hidden = false;
      return;
    }
    update({ ...profile, vmaxKmh: v });
  });
  for (const d of ['electric', 'combustion'] as Drive[]) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="radio" name="drive" value="${d}" /> <span></span>`;
    label.querySelector('span')!.textContent = t(`profile.drive.${d}`);
    label.querySelector('input')!.addEventListener('change', () => update({ ...profile, drive: d }));
    drive.append(label);
  }
  render();
  return root;
}
