/**
 * Small floating buttons at the bottom centre: my location as start (◎),
 * reverse (⇄), start navigation (▶) and cancel (✕).
 */

import { t } from '../i18n';
import { keepAboveAttribution } from './aboveAttribution';

export interface RouteControlsState {
  areaLoaded: boolean;
  hasStart: boolean;
  hasRoute: boolean;
}

export interface RouteControls {
  root: HTMLElement;
  update(s: RouteControlsState): void;
}

export interface RouteControlActions {
  onLocate(): void;
  onReverse(): void;
  onNavigate(): void;
  onCancel(): void;
}

export function createRouteControls(a: RouteControlActions): RouteControls {
  const root = document.createElement('div');
  root.className = 'route-controls';
  root.hidden = true;
  const button = (label: string, text: string, onClick: () => void, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.className = cls;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation(); // never reach the map (a map tap would set a point)
      onClick();
    });
    root.append(b);
    return b;
  };
  const locate = button(t('nav.locate'), '◎', a.onLocate);
  const rev = button(t('route.reverse'), '⇄', a.onReverse);
  const go = button(t('nav.start'), '▶', a.onNavigate, 'primary');
  const cancel = button(t('route.cancel'), '✕', a.onCancel);

  const place = keepAboveAttribution(root);
  return {
    root,
    update(s) {
      root.hidden = !s.areaLoaded;
      locate.hidden = !s.areaLoaded;
      rev.hidden = go.hidden = !s.hasRoute;
      cancel.hidden = !s.hasStart;
      if (!root.hidden) place();
    },
  };
}
