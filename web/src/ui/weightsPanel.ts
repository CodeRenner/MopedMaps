/** Sliders for the cost weights (time, safety, energy) and −/0/+ per safety factor. */

import { RISK_PREF_FACTORS, WEIGHT_ENERGY_RANGE, WEIGHT_RISK_RANGE, WEIGHT_TIME_RANGE } from '../config';
import { formatNumber, getLocale, t } from '../i18n';
import { type CostWeights, NEUTRAL_PREFS } from '../router/profile';
import { RISK_PREF_KEYS } from './weights';

type Range = { min: number; max: number; step: number };

export function createWeightsPanel(initial: CostWeights, onChange: (w: CostWeights) => void): HTMLElement {
  let w = initial;
  const root = document.createElement('details');
  root.className = 'panel weights';
  const summary = document.createElement('summary');
  summary.textContent = t('weights.title');
  root.append(summary);

  const slider = (key: 'time' | 'risk' | 'energy', range: Range, labelKey: string) => {
    const label = document.createElement('label');
    label.className = 'row';
    const span = document.createElement('span');
    const input = document.createElement('input');
    Object.assign(input, {
      type: 'range',
      min: String(range.min),
      max: String(range.max),
      step: String(range.step),
      value: String(w[key]),
    });
    const show = () => (span.textContent = t(labelKey, { value: formatNumber(getLocale(), Number(input.value), 2) }));
    show();
    input.addEventListener('input', () => {
      show();
      w = { ...w, [key]: Number(input.value) };
      onChange(w);
    });
    label.append(span, input);
    root.append(label);
  };
  slider('time', WEIGHT_TIME_RANGE, 'weights.time');
  slider('risk', WEIGHT_RISK_RANGE, 'weights.risk');
  slider('energy', WEIGHT_ENERGY_RANGE, 'weights.energy');
  const hint = document.createElement('p');
  hint.className = 'hint-muted';
  hint.textContent = t('weights.hint');
  root.append(hint);

  // Safety in detail: − (×0.5), 0 (×1), + (×2) per factor.
  const prefs = document.createElement('fieldset');
  prefs.className = 'risk-prefs';
  const legend = document.createElement('legend');
  legend.textContent = t('prefs.title');
  prefs.append(legend);
  const choices: [string, number][] = [
    ['−', RISK_PREF_FACTORS.minus],
    ['0', RISK_PREF_FACTORS.neutral],
    ['+', RISK_PREF_FACTORS.plus],
  ];
  for (const key of RISK_PREF_KEYS) {
    const row = document.createElement('div');
    row.className = 'pref-row';
    const name = document.createElement('span');
    name.textContent = t(`prefs.${key}`);
    const group = document.createElement('div');
    group.className = 'pref-choice';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', t(`prefs.${key}`));
    const buttons = choices.map(([label, factor]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('aria-label', t(`prefs.level.${label === '−' ? 'minus' : label === '+' ? 'plus' : 'neutral'}`));
      b.addEventListener('click', () => {
        w = { ...w, prefs: { ...(w.prefs ?? NEUTRAL_PREFS), [key]: factor } };
        render();
        onChange(w);
      });
      group.append(b);
      return [b, factor] as const;
    });
    const render = () => {
      const current = (w.prefs ?? NEUTRAL_PREFS)[key];
      for (const [b, f] of buttons) b.setAttribute('aria-pressed', String(f === current));
    };
    render();
    row.append(name, group);
    prefs.append(row);
  }
  const prefsHint = document.createElement('p');
  prefsHint.className = 'hint-muted';
  prefsHint.textContent = t('prefs.hint');
  prefs.append(prefsHint);
  root.append(prefs);
  return root;
}
