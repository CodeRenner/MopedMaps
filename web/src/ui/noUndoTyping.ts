/**
 * Typing without undo history, against iOS "Shake to Undo".
 *
 * On the handlebar every bump is a "shake", and iOS then offers "Undo Typing"
 * for whatever was typed earlier on the page. A web page cannot switch the
 * gesture off, and blurring or replacing the field does not clear WebKit's
 * undo history. Edits made by script (setting `value`) are never recorded,
 * so plain typing and deleting in text fields is applied by script instead:
 * `beforeinput` is cancelled and the same change is made programmatically.
 * Input types we cannot reproduce exactly (IME composition, autocorrect
 * replacements) still run natively, so autocorrect is switched off on the
 * fields where it is useless anyway (addresses, numbers).
 */

export interface Edit {
  value: string;
  caret: number;
}

const isLowSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff;
const isHighSurrogate = (c: number) => c >= 0xd800 && c <= 0xdbff;

/** Start of the word before `pos` (skips trailing spaces first), like Alt+Backspace. */
function wordStart(s: string, pos: number): number {
  let i = pos;
  while (i > 0 && /\s/.test(s[i - 1]!)) i--;
  while (i > 0 && !/\s/.test(s[i - 1]!)) i--;
  return i;
}

/**
 * The edit a `beforeinput` event would make, or null when it cannot be
 * reproduced (then the browser does it natively).
 */
export function applyEdit(value: string, start: number, end: number, inputType: string, data: string | null): Edit | null {
  const replace = (from: number, to: number, text: string): Edit => ({
    value: value.slice(0, from) + text + value.slice(to),
    caret: from + text.length,
  });
  switch (inputType) {
    case 'insertText':
    case 'insertFromPaste':
      return data === null ? null : replace(start, end, data);
    case 'deleteContentBackward': {
      if (start !== end) return replace(start, end, '');
      if (start === 0) return { value, caret: 0 };
      const from = start >= 2 && isLowSurrogate(value.charCodeAt(start - 1)) && isHighSurrogate(value.charCodeAt(start - 2)) ? start - 2 : start - 1;
      return replace(from, start, '');
    }
    case 'deleteContentForward': {
      if (start !== end) return replace(start, end, '');
      if (start >= value.length) return { value, caret: start };
      const to = isHighSurrogate(value.charCodeAt(start)) && isLowSurrogate(value.charCodeAt(start + 1)) ? start + 2 : start + 1;
      return replace(start, to, '');
    }
    case 'deleteWordBackward':
      return start !== end ? replace(start, end, '') : replace(wordStart(value, start), start, '');
    case 'deleteSoftLineBackward':
    case 'deleteHardLineBackward':
      return start !== end ? replace(start, end, '') : replace(0, start, '');
    case 'deleteByCut':
      return replace(start, end, '');
    default:
      return null;
  }
}

const TEXT_TYPES = new Set(['text', 'search', 'tel', 'url', 'email', '']);

function isTextInput(t: EventTarget | null): t is HTMLInputElement {
  return t instanceof HTMLInputElement && TEXT_TYPES.has(t.getAttribute('type') ?? '') && !t.readOnly && !t.disabled;
}

/**
 * Install once for the whole document. `input` events are dispatched as
 * usual; `change` is dispatched on blur if the browser does not (it may not
 * for script-made edits).
 */
export function installNoUndoTyping(doc: Document = document): void {
  let focusValue: string | null = null;
  let nativeChange = false;
  doc.addEventListener(
    'beforeinput',
    (ev) => {
      const el = ev.target;
      if (!isTextInput(el) || !ev.cancelable || ev.isComposing) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start === null || end === null) return;
      const data = ev.inputType === 'insertFromPaste' ? (ev.dataTransfer?.getData('text/plain') ?? ev.data) : ev.data;
      const edit = applyEdit(el.value, start, end, ev.inputType, data);
      if (!edit) return;
      if (el.maxLength >= 0 && edit.value.length > el.maxLength && edit.value.length > el.value.length) {
        ev.preventDefault(); // the browser would refuse the extra characters too
        return;
      }
      ev.preventDefault();
      if (edit.value !== el.value) {
        el.value = edit.value;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: ev.inputType, data: ev.data }));
      }
      el.setSelectionRange(edit.caret, edit.caret);
    },
    true,
  );
  doc.addEventListener(
    'focusin',
    (ev) => {
      if (!isTextInput(ev.target)) return;
      const el = ev.target;
      // Autocorrect would replace words natively (and record undo steps); it is useless for addresses and numbers.
      el.setAttribute('autocorrect', 'off');
      el.spellcheck = false;
      focusValue = el.value;
      nativeChange = false;
    },
    true,
  );
  doc.addEventListener('change', () => (nativeChange = true), true);
  doc.addEventListener(
    'focusout',
    (ev) => {
      const el = ev.target;
      if (!isTextInput(el) || focusValue === null) return;
      const before = focusValue;
      focusValue = null;
      // The native change event (if any) fires before focusout; give it a tick anyway.
      setTimeout(() => {
        if (!nativeChange && el.value !== before) el.dispatchEvent(new Event('change', { bubbles: true }));
      }, 0);
    },
    true,
  );
}
