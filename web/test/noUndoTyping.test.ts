import { describe, expect, it } from 'vitest';
import { applyEdit } from '../src/ui/noUndoTyping';

describe('typing applied by script (no iOS undo history)', () => {
  it('inserts and replaces the selection', () => {
    expect(applyEdit('Hauptstr', 8, 8, 'insertText', 'a')).toEqual({ value: 'Hauptstra', caret: 9 });
    expect(applyEdit('Hauptstr', 0, 5, 'insertText', 'Neben')).toEqual({ value: 'Nebenstr', caret: 5 });
    expect(applyEdit('ab', 1, 1, 'insertFromPaste', 'XY')).toEqual({ value: 'aXYb', caret: 3 });
    expect(applyEdit('ab', 1, 1, 'insertText', null)).toBeNull();
  });

  it('deletes characters, words and lines', () => {
    expect(applyEdit('Straße', 6, 6, 'deleteContentBackward', null)).toEqual({ value: 'Straß', caret: 5 });
    expect(applyEdit('a😀', 3, 3, 'deleteContentBackward', null)).toEqual({ value: 'a', caret: 1 }); // whole emoji
    expect(applyEdit('abc', 0, 0, 'deleteContentBackward', null)).toEqual({ value: 'abc', caret: 0 });
    expect(applyEdit('abc', 1, 1, 'deleteContentForward', null)).toEqual({ value: 'ac', caret: 1 });
    expect(applyEdit('abc', 1, 3, 'deleteContentBackward', null)).toEqual({ value: 'a', caret: 1 });
    expect(applyEdit('Am Markt 5 ', 11, 11, 'deleteWordBackward', null)).toEqual({ value: 'Am Markt ', caret: 9 });
    expect(applyEdit('Am Markt', 8, 8, 'deleteSoftLineBackward', null)).toEqual({ value: '', caret: 0 });
    expect(applyEdit('abc', 0, 2, 'deleteByCut', null)).toEqual({ value: 'c', caret: 0 });
  });

  it('leaves what it cannot reproduce to the browser', () => {
    expect(applyEdit('abc', 3, 3, 'insertReplacementText', 'abd')).toBeNull();
    expect(applyEdit('abc', 3, 3, 'insertCompositionText', 'x')).toBeNull();
    expect(applyEdit('abc', 3, 3, 'historyUndo', null)).toBeNull();
  });
});
