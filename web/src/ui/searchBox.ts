/** Always-visible search field for addresses and places (offline index). Thin DOM layer. */

import { t } from '../i18n';
import type { SearchResult } from '../search/index';

export interface SearchBox {
  root: HTMLElement;
  /** loading: area/search data still loading; unavailable: no search data on the server or cached */
  setState(state: 'loading' | 'ready' | 'unavailable'): void;
  /** Swap in a fresh input element (keeps the text); drops iOS's undo history for the typing. */
  resetUndo(): void;
}

export interface SearchActions {
  search(query: string): SearchResult[];
  pick(r: SearchResult): void;
}

export function createSearchBox(a: SearchActions): SearchBox {
  const root = document.createElement('div');
  root.className = 'panel search';
  root.setAttribute('role', 'search');
  const list = document.createElement('ul');
  list.className = 'search-results';
  list.setAttribute('role', 'listbox');

  let timer: ReturnType<typeof setTimeout> | undefined;
  const makeInput = (): HTMLInputElement => {
    const el = document.createElement('input');
    el.type = 'search';
    el.className = 'search-input';
    el.placeholder = t('search.notReady');
    el.setAttribute('aria-label', t('search.placeholder'));
    el.autocomplete = 'off';
    el.enterKeyHint = 'search';
    el.disabled = true;
    el.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(run, 120);
    });
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        clearTimeout(timer);
        run();
        (list.querySelector('button') as HTMLButtonElement | null)?.click();
      } else if (ev.key === 'Escape') {
        el.value = '';
        clear();
      }
    });
    return el;
  };
  let input = makeInput();
  root.append(input, list);
  /**
   * iOS keeps the typing in the page's undo history, so every shake on the
   * handlebar offers "Undo Typing". Blurring is not enough; a new element
   * (same text, state and placeholder) has no history.
   */
  const resetUndo = () => {
    const fresh = makeInput();
    fresh.value = input.value;
    fresh.disabled = input.disabled;
    fresh.placeholder = input.placeholder;
    input.replaceWith(fresh);
    input = fresh;
  };

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
          resetUndo();
          a.pick(r);
        });
        li.append(b);
        return li;
      }),
    );
  };
  return {
    root,
    setState(state) {
      input.disabled = state !== 'ready';
      input.placeholder = t(state === 'ready' ? 'search.placeholder' : state === 'loading' ? 'search.notReady' : 'search.unavailable');
      if (state !== 'ready') clear();
    },
    resetUndo,
  };
}
