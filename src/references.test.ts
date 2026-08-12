import { describe, expect, it } from 'bun:test';

import { refAt, target } from '../test/factories.js';
import { editFor, renderAsPath, sliceBody } from './references.js';

describe('renderAsPath', () => {
  it('renders a resolved link as an @ path', () => {
    const content = 'See [[Design]] for context';
    expect(renderAsPath(refAt(content, '[[Design]]'))).toBe('@~/Vaults/notes/Work/Design.md');
  });

  it('discards alias text', () => {
    const content = 'See [[Design|the API contract]] for context';

    expect(renderAsPath(refAt(content, '[[Design|the API contract]]'))).toBe(
      '@~/Vaults/notes/Work/Design.md',
    );
  });

  it('backtick-wraps a path containing spaces', () => {
    const content = 'See [[Kubernetes notes]]';
    const item = refAt(content, '[[Kubernetes notes]]', {
      target: target({ displayPath: '~/Vaults/notes/Kubernetes notes.md' }),
    });

    expect(renderAsPath(item)).toBe('`@~/Vaults/notes/Kubernetes notes.md`');
  });

  it('keeps a heading anchor as a hint', () => {
    const content = 'See [[Design#Rate limits]]';
    const item = refAt(content, '[[Design#Rate limits]]', { anchor: 'Rate limits' });

    expect(renderAsPath(item)).toBe('@~/Vaults/notes/Work/Design.md (see "Rate limits")');
  });

  it('keeps a block anchor as a hint', () => {
    const content = 'See [[Design#^a1b2]]';
    const item = refAt(content, '[[Design#^a1b2]]', { anchor: '^a1b2' });

    expect(renderAsPath(item)).toBe('@~/Vaults/notes/Work/Design.md (see block ^a1b2)');
  });

  it('leaves an unresolved link exactly as written', () => {
    // Emitting a path for a note that does not exist sends the model chasing a
    // missing file; a bare wikilink reads as "not a real file yet".
    const content = 'See [[Note I never wrote]]';
    const item = refAt(content, '[[Note I never wrote]]', { target: null });

    expect(renderAsPath(item)).toBe('[[Note I never wrote]]');
  });

  it('withholds an excluded note without naming it', () => {
    const content = 'See [[Diary]]';
    const item = refAt(content, '[[Diary]]', {
      target: target({ vaultPath: 'Personal/Diary.md', excluded: true }),
    });

    expect(renderAsPath(item)).toBe('[excluded]');
  });

  it('names the excluded note when asked', () => {
    const content = 'See [[Diary]]';
    const item = refAt(content, '[[Diary]]', {
      target: target({ vaultPath: 'Personal/Diary.md', excluded: true }),
    });

    expect(renderAsPath(item, true)).toBe('[excluded: Personal/Diary.md]');
  });
});

describe('sliceBody', () => {
  const content = 'Intro [[Design]] middle [[Design]] tail';
  const first = refAt(content, '[[Design]]');
  const lastStart = content.lastIndexOf('[[Design]]');
  const second = { ...first, start: lastStart, end: lastStart + '[[Design]]'.length };
  const full = {
    content,
    references: [first, second],
    cacheEdits: [{ start: 0, end: 5, replacement: '' }],
  };

  it('keeps only references wholly inside the window, rebased', () => {
    const sliced = sliceBody(full, 6, 34);

    expect(sliced.content).toBe('[[Design]] middle [[Design]]');
    expect(sliced.references).toHaveLength(2);
    expect(sliced.references[0]?.start).toBe(0);
    expect(sliced.references[1]?.start).toBe(18);
  });

  it('drops a reference the selection only partly covers', () => {
    // Half-rewriting a link would emit broken wikilink syntax.
    const sliced = sliceBody(full, 10, 34);

    expect(sliced.references).toHaveLength(1);
    expect(sliced.references[0]?.start).toBe(14);
  });

  it('rebases cache edits along with the references', () => {
    expect(sliceBody(full, 0, 20).cacheEdits).toEqual([{ start: 0, end: 5, replacement: '' }]);
  });

  it('drops cache edits outside the window', () => {
    expect(sliceBody(full, 6, 39).cacheEdits).toEqual([]);
  });
});

describe('editFor', () => {
  it('turns a reference into an edit over its own range', () => {
    const content = 'See [[Design]] here';

    expect(editFor(refAt(content, '[[Design]]'), 'X')).toEqual({
      start: 4,
      end: 14,
      replacement: 'X',
    });
  });
});
