/** Sliders for the cost weights a (time) and b (risk). */

import { WEIGHT_RISK_RANGE, WEIGHT_TIME_RANGE } from '../config';
import { formatNumber, getLocale, t } from '../i18n';
import type { CostWeights } from '../router/profile';

type Range = { min: number; max: number; step: number };

export function createWeightsPanel(initial: CostWeights, onChange: (w: CostWeights) => void): HTMLElement {
  let w = initial;
  const root = document.createElement('details');
  root.className = 'panel weights';
  const summary = document.createElement('summary');
  summary.textContent = t('weights.title');
  root.append(summary);

  const slider = (key: 'time' | 'risk', range: Range, labelKey: string) => {
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
  const hint = document.createElement('p');
  hint.className = 'hint-muted';
  hint.textContent = t('weights.hint');
  root.append(hint);
  return root;
}
