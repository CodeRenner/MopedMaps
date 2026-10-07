/** Collapsible vehicle settings: vmax presets + free input, drive type, capacity + real consumption. */

import { MAX_VMAX_KMH, MIN_VMAX_KMH, VMAX_PRESETS_KMH } from '../config';
import { t } from '../i18n';
import type { Drive, VehicleProfile } from '../router/profile';
import type { EnergySettings } from '../router/range';
import { parsePositive, parseVmax } from './profileStore';

/** Energy settings per drive type (the panel shows the ones of the current drive). */
export interface EnergySettingsAccess {
  get(drive: Drive): EnergySettings;
  set(drive: Drive, s: EnergySettings): void;
}

/** Format a stored number for an input field ("" when unset), locale-neutral. */
export const fieldValue = (n: number | null) => (n === null ? '' : String(n));

export function createProfilePanel(
  initial: VehicleProfile,
  onChange: (p: VehicleProfile) => void,
  energy: EnergySettingsAccess,
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
    <fieldset class="drive"><legend></legend></fieldset>
    <label class="row"><span class="capacity-label"></span>
      <input name="capacity" inputmode="decimal" />
    </label>
    <label class="row"><span class="consumption-label"></span>
      <input name="consumption" inputmode="decimal" />
    </label>
    <p class="hint-muted energy-hint"></p>`;
  const summary = root.querySelector('summary')!;
  const presets = root.querySelector<HTMLElement>('.presets')!;
  const vmaxInput = root.querySelector<HTMLInputElement>('input[name=vmax]')!;
  const hint = root.querySelector<HTMLElement>('.hint')!;
  const drive = root.querySelector('fieldset')!;
  const capacityInput = root.querySelector<HTMLInputElement>('input[name=capacity]')!;
  const consumptionInput = root.querySelector<HTMLInputElement>('input[name=consumption]')!;
  const capacityLabel = root.querySelector<HTMLElement>('.capacity-label')!;
  const consumptionLabel = root.querySelector<HTMLElement>('.consumption-label')!;
  root.querySelector('.energy-hint')!.textContent = t('profile.energyHint');

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
    const es = energy.get(profile.drive);
    capacityLabel.textContent = t(`profile.capacity.${profile.drive}`);
    consumptionLabel.textContent = t(`profile.consumption.${profile.drive}`);
    capacityInput.value = fieldValue(es.capacity);
    consumptionInput.value = fieldValue(es.realConsumption);
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
  // Empty or invalid input clears the value (falls back to the model / no range).
  const energyField = (input: HTMLInputElement, key: 'capacity' | 'realConsumption') =>
    input.addEventListener('change', () => {
      const v = parsePositive(input.value);
      energy.set(profile.drive, { ...energy.get(profile.drive), [key]: v });
      input.value = fieldValue(v);
      onChange(profile);
    });
  energyField(capacityInput, 'capacity');
  energyField(consumptionInput, 'realConsumption');
  render();
  return root;
}
