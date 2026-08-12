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

  it('emits a bare @path even when it contains spaces', () => {
    const content = 'See [[Kubernetes notes]]';
    const item = refAt(content, '[[Kubernetes notes]]', {
      target: target({ displayPath: '~/Vaults/notes/Kubernetes notes.md' }),
    });

    expect(renderAsPath(item)).toBe('@~/Vaults/notes/Kubernetes notes.md');
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

  it('clips a reference the selection only partly covers', () => {
    // Dropping it left the raw wikilink in the slice, and for a link to an
    // excluded note that text is the filename the placeholder exists to hide.
    const sliced = sliceBody(full, 10, 34);

    expect(sliced.references).toHaveLength(2);
    expect(sliced.references[0]).toMatchObject({ start: 0, end: 6 });
    expect(sliced.references[1]?.start).toBe(14);
  });

  it('replaces a half-selected link to an excluded note with the placeholder', () => {
    const sensitive = 'Talked to my [[Divorce lawyer]] today.';
    const item = refAt(sensitive, '[[Divorce lawyer]]', {
      target: target({ vaultPath: 'Personal/Divorce lawyer.md', excluded: true }),
    });
    const sliced = sliceBody({ content: sensitive, references: [item], cacheEdits: [] }, 20, 37);

    expect(renderAsPath(sliced.references[0]!)).toBe('[excluded]');
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

describe('clipping a reference that would render as its original text', () => {
  const content = 'Call [[Divorce lawyer tomorrow]] ok';
  const unresolved = refAt(content, '[[Divorce lawyer tomorrow]]', { target: null });
  const body = { content, references: [unresolved], cacheEdits: [] };

  it('drops it rather than emitting text from outside the selection', () => {
    // An unresolved link renders as its full `original`, so clipping it emitted
    // more than the user selected — in one direction, text from before the
    // selection even started.
    expect(sliceBody(body, 0, 14).references).toEqual([]);
    expect(sliceBody(body, 22, 35).references).toEqual([]);
  });

  it('still clips one whose target resolves, since that renders self-contained', () => {
    const resolved = refAt(content, '[[Divorce lawyer tomorrow]]', {
      target: target({ vaultPath: 'Personal/Divorce lawyer.md', excluded: true }),
    });
    const sliced = sliceBody({ ...body, references: [resolved] }, 22, 35);

    expect(renderAsPath(sliced.references[0]!)).toBe('[excluded]');
  });
});
