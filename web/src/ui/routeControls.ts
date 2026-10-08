/** Small floating buttons at the bottom centre: reverse (⇄) and cancel (✕) the route. */

import { t } from '../i18n';

export interface RouteControls {
  root: HTMLElement;
  /** Cancel is shown once a start is set, reverse once a route exists. */
  update(hasStart: boolean, hasRoute: boolean): void;
}

export function createRouteControls(onReverse: () => void, onCancel: () => void): RouteControls {
  const root = document.createElement('div');
  root.className = 'route-controls';
  root.hidden = true;
  const button = (label: string, text: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation(); // never reach the map (a map tap would set a point)
      onClick();
    });
    root.append(b);
    return b;
  };
  const rev = button(t('route.reverse'), '⇄', onReverse);
  button(t('route.cancel'), '✕', onCancel);
  // Sit just above the map attribution, whose height depends on screen width
  // and on whether it is expanded (it wraps to several lines on phones).
  const place = () => {
    const attrib = document.querySelector('.maplibregl-ctrl-attrib');
    const top = attrib?.getBoundingClientRect().top;
    root.style.bottom = top ? `${Math.max(12, window.innerHeight - top + 10)}px` : '';
  };
  const attrib = document.querySelector('.maplibregl-ctrl-attrib');
  if (attrib && 'ResizeObserver' in window) new ResizeObserver(place).observe(attrib);
  window.addEventListener('resize', place);
  return {
    root,
    update(hasStart, hasRoute) {
      if (hasStart) place();
      root.hidden = !hasStart;
      rev.hidden = !hasRoute;
    },
  };
}
