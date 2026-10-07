/** Collapsible route chart: speed (left axis) and elevation (right axis) over distance. */

import { CHART_H, CHART_W, chartLayout, PLOT } from '../chart/layout';
import { chartSeries, valueAt } from '../chart/model';
import { formatNumber, getLocale, t } from '../i18n';
import type { RouteProfile } from '../router/routeProfile';

export interface RouteChart {
  root: HTMLElement;
  /** Show the chart for a route, or hide it (null). */
  setProfile(p: RouteProfile | null): void;
}

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

export function createRouteChart(): RouteChart {
  const root = document.createElement('details');
  root.className = 'panel chart';
  root.hidden = true;
  const summary = document.createElement('summary');
  summary.textContent = t('chart.title');
  const legend = document.createElement('p');
  legend.className = 'chart-legend';
  const svg = el('svg', { viewBox: `0 0 ${CHART_W} ${CHART_H}`, role: 'img' });
  const readout = document.createElement('p');
  readout.className = 'chart-readout';
  readout.setAttribute('aria-live', 'polite');
  root.append(summary, legend, svg, readout);

  let current: ReturnType<typeof chartSeries> | null = null;
  let layout: ReturnType<typeof chartLayout> | null = null;
  const cursor = el('line', { class: 'cursor', y1: PLOT.top, y2: PLOT.bottom, visibility: 'hidden' });

  const showAt = (clientX: number) => {
    if (!current || !layout) return;
    const box = svg.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * CHART_W;
    const d = layout.distanceAtX(x);
    const loc = getLocale();
    const speed = valueAt(current.speed, d, true);
    const h = valueAt(current.elevation, d);
    cursor.setAttribute('x1', layout.xOf(d).toFixed(1));
    cursor.setAttribute('x2', layout.xOf(d).toFixed(1));
    cursor.setAttribute('visibility', 'visible');
    const params = {
      km: formatNumber(loc, d / 1000, 1),
      kmh: String(Math.round(speed ?? 0)),
      m: h === null ? '' : String(Math.round(h)),
    };
    readout.textContent = t(h === null ? 'chart.readoutNoHeight' : 'chart.readout', params);
  };
  svg.addEventListener('pointermove', (ev) => showAt(ev.clientX));
  svg.addEventListener('pointerdown', (ev) => showAt(ev.clientX));
  svg.addEventListener('pointerleave', () => cursor.setAttribute('visibility', 'hidden'));

  const render = () => {
    if (!current) return;
    const L = (layout = chartLayout(current));
    const loc = getLocale();
    const kids: SVGElement[] = [];
    for (const tk of L.speedTicks) {
      kids.push(el('line', { class: 'grid', x1: PLOT.left, x2: PLOT.right, y1: tk.pos, y2: tk.pos }));
      const lbl = el('text', { class: 'axis speed', x: PLOT.left - 4, y: tk.pos + 3, 'text-anchor': 'end' });
      lbl.textContent = String(tk.value);
      kids.push(lbl);
    }
    for (const tk of L.elevationTicks) {
      const lbl = el('text', { class: 'axis elevation', x: PLOT.right + 4, y: tk.pos + 3 });
      lbl.textContent = String(tk.value);
      kids.push(lbl);
    }
    for (const tk of L.xTicks) {
      const lbl = el('text', { class: 'axis', x: tk.pos, y: CHART_H - 4, 'text-anchor': 'middle' });
      lbl.textContent = formatNumber(loc, tk.value, tk.value % 1 ? 1 : 0);
      kids.push(lbl);
    }
    if (L.elevationArea) {
      kids.push(el('path', { class: 'elevation-area', d: L.elevationArea }));
      kids.push(el('path', { class: 'elevation-line', d: L.elevationLine }));
    }
    kids.push(el('path', { class: 'speed-line', d: L.speedPath }), cursor);
    svg.replaceChildren(...kids);
    svg.setAttribute('aria-label', t('chart.title'));
    legend.textContent = L.elevationArea ? t('chart.legend') : `${t('chart.legendSpeed')} · ${t('chart.noHeights')}`;
    readout.textContent = t('chart.hint');
  };

  return {
    root,
    setProfile(p) {
      current = p && p.speedKmh.length > 0 ? chartSeries(p) : null;
      root.hidden = !current;
      cursor.setAttribute('visibility', 'hidden');
      render();
    },
  };
}
