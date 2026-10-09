/** Always-visible search field for addresses and places (offline index). Thin DOM layer. */

import { t } from '../i18n';
import type { SearchResult } from '../search/index';

export interface SearchBox {
  root: HTMLElement;
  /** loading: area/search data still loading; unavailable: no search data on the server or cached */
  setState(state: 'loading' | 'ready' | 'unavailable'): void;
}

export interface SearchActions {
  search(query: string): SearchResult[];
  pick(r: SearchResult): void;
}

export function createSearchBox(a: SearchActions): SearchBox {
  const root = document.createElement('div');
  root.className = 'panel search';
  root.setAttribute('role', 'search');
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'search-input';
  input.placeholder = t('search.notReady');
  input.setAttribute('aria-label', t('search.placeholder'));
  input.autocomplete = 'off';
  input.enterKeyHint = 'search';
  input.disabled = true;
  const list = document.createElement('ul');
  list.className = 'search-results';
  list.setAttribute('role', 'listbox');
  root.append(input, list);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => list.replaceChildren();
  const run = () => {
    const q = input.value.trim();
    if (q.length < 2) return clear();
    const results = a.search(q);
    if (results.length === 0) {
      const li = document.createElement('li');
      li.className = 'search-empty';
      li.textContent = t('search.none');
      return list.replaceChildren(li);
    }
    list.replaceChildren(
      ...results.map((r) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'option');
        const title = document.createElement('span');
        title.className = 'search-title';
        title.textContent = r.label;
        const detail = document.createElement('span');
        detail.className = 'search-detail';
        detail.textContent = r.detail;
        b.append(title, detail);
        b.addEventListener('click', () => {
          input.value = r.label;
          clear();
          input.blur(); // closes the phone keyboard
          a.pick(r);
        });
        li.append(b);
        return li;
      }),
    );
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      clearTimeout(timer);
      run();
      (list.querySelector('button') as HTMLButtonElement | null)?.click();
    } else if (ev.key === 'Escape') {
      input.value = '';
      clear();
    }
  });

  return {
    root,
    setState(state) {
      input.disabled = state !== 'ready';
      input.placeholder = t(state === 'ready' ? 'search.placeholder' : state === 'loading' ? 'search.notReady' : 'search.unavailable');
      if (state !== 'ready') clear();
    },
  };
}
