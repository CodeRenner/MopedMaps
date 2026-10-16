/**
 * Collapsible vehicle settings: vmax presets + free input, drive type, capacity
 * + real consumption, and the consumption learned from rides.
 */

import { LEARN_MIN_FUEL_KM, MAX_VMAX_KMH, MIN_VMAX_KMH, RANGE_REFERENCE_SPEED_KMH, VMAX_PRESETS_KMH } from '../config';
import { formatNumber, getLocale, t } from '../i18n';
import {
  type LearnState,
  learnedFactor,
  learnedTrusted,
  resetLearning,
  setAsking,
  startFuelWindow,
  submitFill,
} from '../router/learning';
import type { Drive, VehicleProfile } from '../router/profile';
import { type EnergySettings, referenceConsumption } from '../router/range';
import { consumptionText } from './messages';
import { parsePositive, parseVmax } from './profileStore';

/** Energy settings per drive type (the panel shows the ones of the current drive). */
export interface EnergySettingsAccess {
  get(drive: Drive): EnergySettings;
  set(drive: Drive, s: EnergySettings): void;
}

/** Learned consumption per drive type. */
export interface LearnStateAccess {
  get(drive: Drive): LearnState;
  set(drive: Drive, s: LearnState): void;
}

export interface ProfilePanel {
  root: HTMLElement;
  /** Re-read stored settings (e.g. after a ride was learned). */
  refresh(): void;
}

/** Format a stored number for an input field ("" when unset), locale-neutral. */
export const fieldValue = (n: number | null) => (n === null ? '' : String(n));

export function createProfilePanel(
  initial: VehicleProfile,
  onChange: (p: VehicleProfile) => void,
  energy: EnergySettingsAccess,
  learning: LearnStateAccess,
): ProfilePanel {
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
    <p class="hint-muted energy-hint"></p>
    <div class="learn">
      <p class="hint-muted learn-status"></p>
      <label class="row fill-row"><span class="fill-label"></span>
        <input name="fill" inputmode="decimal" />
      </label>
      <button type="button" class="fill-btn"></button>
      <label class="learn-ask"><input type="checkbox" name="ask" /> <span class="ask-label"></span></label>
      <button type="button" class="learn-reset"></button>
    </div>`;
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
  const learnStatus = root.querySelector<HTMLElement>('.learn-status')!;
  const fillRow = root.querySelector<HTMLElement>('.fill-row')!;
  const fillInput = root.querySelector<HTMLInputElement>('input[name=fill]')!;
  const fillBtn = root.querySelector<HTMLButtonElement>('.fill-btn')!;
  const askBox = root.querySelector<HTMLInputElement>('input[name=ask]')!;
  const resetBtn = root.querySelector<HTMLButtonElement>('.learn-reset')!;
  root.querySelector('.fill-label')!.textContent = t('learn.fuelRide.litres');
  fillBtn.textContent = t('learn.fillButton');
  root.querySelector('.ask-label')!.textContent = t('learn.ask');
  resetBtn.textContent = t('learn.reset');
  /** Outcome of the last fill-up entered here, shown once below the status. */
  let fillNote = '';

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
    renderLearning(es);
  };
  const renderLearning = (es: EnergySettings) => {
    const ls = learning.get(profile.drive);
    const loc = getLocale();
    const k = learnedFactor(ls);
    const parts: string[] = [];
    if (k === null) parts.push(t(`learn.status.none.${profile.drive}`));
    else {
      parts.push(
        t('learn.status.learned', {
          n: ls.samples.length,
          value: consumptionText(loc, profile.drive, referenceConsumption(profile) * k),
          kmh: Math.min(RANGE_REFERENCE_SPEED_KMH, profile.vmaxKmh),
        }),
      );
      if (es.realConsumption !== null) parts.push(t(learnedTrusted(ls) ? 'learn.status.replaces' : 'learn.status.manualFirst'));
    }
    if (ls.fuel) {
      parts.push(
        t('learn.status.window', {
          date: new Date(ls.fuel.since).toLocaleDateString(loc),
          km: formatNumber(loc, ls.fuel.km, 0),
        }),
      );
    }
    if (fillNote) parts.push(fillNote);
    learnStatus.textContent = parts.join(' ');
    const fuel = profile.drive === 'combustion';
    fillRow.hidden = !fuel || !ls.fuel;
    fillBtn.hidden = !fuel;
    askBox.checked = !ls.optOut;
    resetBtn.hidden = ls.samples.length === 0 && !ls.fuel;
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

  const setLearning = (ls: LearnState) => {
    learning.set(profile.drive, ls);
    render();
    onChange(profile); // the learned factor changes the range estimate
  };
  // Combustion, full-to-full: the first tap starts a measurement, later ones close it with the litres refilled.
  fillBtn.addEventListener('click', () => {
    const ls = learning.get(profile.drive);
    const litres = parsePositive(fillInput.value);
    fillInput.value = '';
    if (!ls.fuel || litres === null) {
      fillNote = t('learn.fuelStarted');
      setLearning(startFuelWindow(ls, Date.now()));
      return;
    }
    const res = submitFill(ls, litres, Date.now());
    fillNote = t(`learn.outcome.${res.outcome}`, { km: LEARN_MIN_FUEL_KM });
    setLearning(res.state);
  });
  askBox.addEventListener('change', () => setLearning(setAsking(learning.get(profile.drive), askBox.checked)));
  resetBtn.addEventListener('click', () => {
    fillNote = '';
    setLearning(resetLearning(learning.get(profile.drive)));
  });
  render();
  return {
    root,
    refresh: () => {
      fillNote = '';
      render();
    },
  };
}
