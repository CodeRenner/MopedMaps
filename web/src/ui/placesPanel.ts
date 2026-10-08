/** Collapsible "Ziele" panel: home, work and recent destinations. Thin DOM layer. */

import { t } from '../i18n';
import type { FavouriteKey, Place, Places } from './placesStore';

export interface PlacesPanel {
  root: HTMLElement;
  render(p: Places, hasTarget: boolean): void;
}

export interface PlacesActions {
  go(place: Place): void;
  saveFavourite(key: FavouriteKey): void;
  clearFavourite(key: FavouriteKey): void;
}

function shortDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

export function createPlacesPanel(a: PlacesActions): PlacesPanel {
  const root = document.createElement('details');
  root.className = 'panel places';
  const summary = document.createElement('summary');
  summary.textContent = t('places.title');
  const body = document.createElement('div');
  body.className = 'places-body';
  root.append(summary, body);

  const button = (text: string, cls: string, onClick: () => void, label?: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = text;
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClick();
    });
    return b;
  };

  return {
    root,
    render(p, hasTarget) {
      const favs = document.createElement('div');
      favs.className = 'places-favs';
      for (const key of ['home', 'work'] as FavouriteKey[]) {
        const place = p[key];
        const icon = key === 'home' ? '⌂' : '⚒';
        const go = button(`${icon} ${t(`places.${key}`)}`, 'fav', () => place && a.go(place));
        go.disabled = !place;
        go.title = place ? place.label : t('places.notSet');
        const wrap = document.createElement('div');
        wrap.className = 'fav-wrap';
        wrap.append(go);
        if (hasTarget) wrap.append(button('＋', 'fav-save', () => a.saveFavourite(key), t(`places.save.${key}`)));
        else if (place) wrap.append(button('✕', 'fav-clear', () => a.clearFavourite(key), t(`places.clear.${key}`)));
        favs.append(wrap);
      }
      const list = document.createElement('div');
      list.className = 'places-recent';
      if (p.recent.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'hint-muted';
        empty.textContent = t('places.empty');
        list.append(empty);
      }
      for (const r of p.recent) {
        list.append(button(`${r.label} · ${shortDate(r.ts)}`, 'recent', () => a.go(r)));
      }
      const hint = document.createElement('p');
      hint.className = 'hint-muted';
      hint.textContent = hasTarget ? t('places.saveHint') : t('places.goHint');
      body.replaceChildren(favs, list, hint);
    },
  };
}
