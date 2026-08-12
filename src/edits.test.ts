import { describe, expect, it } from 'bun:test';

import { applyEdits, rebaseEdits } from './edits.js';

describe('applyEdits', () => {
  const source = 'one two three';

  it('returns the source unchanged when there are no edits', () => {
    expect(applyEdits(source, [])).toBe(source);
  });

  it('applies a single edit', () => {
    expect(applyEdits(source, [{ start: 4, end: 7, replacement: 'TWO' }])).toBe('one TWO three');
  });

  it('applies several edits without shifting each other', () => {
    // Replacements of different lengths: a left-to-right pass would corrupt the
    // later offsets, which is the entire reason this module exists.
    const result = applyEdits(source, [
      { start: 0, end: 3, replacement: 'a' },
      { start: 8, end: 13, replacement: 'longer-than-before' },
    ]);

    expect(result).toBe('a two longer-than-before');
  });

  it('is insensitive to the order edits arrive in', () => {
    const edits = [
      { start: 8, end: 13, replacement: 'C' },
      { start: 0, end: 3, replacement: 'A' },
      { start: 4, end: 7, replacement: 'B' },
    ];

    expect(applyEdits(source, edits)).toBe('A B C');
    expect(applyEdits(source, edits.toReversed())).toBe('A B C');
  });

  it('lets an enclosing edit win over one nested inside it', () => {
    const result = applyEdits(source, [
      { start: 4, end: 7, replacement: 'inner' },
      { start: 0, end: 13, replacement: 'outer' },
    ]);

    expect(result).toBe('outer');
  });

  it('keeps the first of two partially overlapping edits', () => {
    const result = applyEdits(source, [
      { start: 0, end: 7, replacement: 'A' },
      { start: 4, end: 13, replacement: 'B' },
    ]);

    expect(result).toBe('A three');
  });

  it('treats abutting edits as non-overlapping', () => {
    const result = applyEdits(source, [
      { start: 0, end: 4, replacement: 'X' },
      { start: 4, end: 8, replacement: 'Y' },
    ]);

    expect(result).toBe('XYthree');
  });
});

describe('rebaseEdits', () => {
  const edits = [
    { start: 0, end: 3, replacement: 'A' },
    { start: 10, end: 20, replacement: 'B' },
    { start: 30, end: 40, replacement: 'C' },
  ];

  it('keeps and rebases edits inside the window', () => {
    expect(rebaseEdits(edits, 10, 25)).toEqual([{ start: 0, end: 10, replacement: 'B' }]);
  });

  it('drops an edit that straddles the window edge', () => {
    // Half-rewriting a link the user only partly selected would emit broken
    // syntax, so the whole reference has to be inside the selection.
    expect(rebaseEdits(edits, 15, 40)).toEqual([{ start: 15, end: 25, replacement: 'C' }]);
  });

  it('includes an edit flush against both bounds', () => {
    expect(rebaseEdits(edits, 10, 20)).toEqual([{ start: 0, end: 10, replacement: 'B' }]);
  });

  it('returns nothing for a window containing no whole edit', () => {
    expect(rebaseEdits(edits, 21, 29)).toEqual([]);
  });
});

describe('applyEdits with priority', () => {
  it('lets a container win over a higher-priority edit inside it', () => {
    // A redaction matching a key inside a frontmatter block must not cancel the
    // removal of that block — doing so emitted the whole block with one word
    // swapped, which is the opposite of what either edit wanted.
    const source = '---\nkey: SECRET\nsalary: 250000\n---\nBody.';
    const frontmatter = { start: 0, end: source.indexOf('Body.'), replacement: '' };
    const redaction = {
      start: source.indexOf('SECRET'),
      end: source.indexOf('SECRET') + 6,
      replacement: '[redacted]',
      priority: 1,
    };

    expect(applyEdits(source, [frontmatter, redaction])).toBe('Body.');
  });

  it('lets a higher-priority edit win a partial overlap', () => {
    // Nothing else deletes this text, so losing here would leave behind exactly
    // what the redaction existed to remove.
    const source = 'Mail bob@example.com now';
    const link = { start: 0, end: 9, replacement: 'LINK' };
    const redaction = { start: 5, end: 20, replacement: '[redacted]', priority: 1 };

    expect(applyEdits(source, [link, redaction])).toBe('Mail [redacted] now');
  });

  it('still resolves equal-priority overlaps outermost-first', () => {
    const source = 'one two three';

    expect(
      applyEdits(source, [
        { start: 4, end: 7, replacement: 'inner' },
        { start: 0, end: 13, replacement: 'outer' },
      ]),
    ).toBe('outer');
  });
});

describe('rebaseEdits with priority', () => {
  it('clips a straddling redaction instead of dropping it', () => {
    // Dropping it meant "copy selection" failed open on the one control the
    // rest of this work was hardening.
    const redaction = { start: 4, end: 26, replacement: '[redacted]', priority: 1 };

    expect(rebaseEdits([redaction], 8, 30)).toEqual([
      { start: 0, end: 18, replacement: '[redacted]', priority: 1 },
    ]);
  });

  it('still drops a straddling replacement that would break syntax', () => {
    const link = { start: 4, end: 26, replacement: '@path' };

    expect(rebaseEdits([link], 8, 30)).toEqual([]);
  });
});
