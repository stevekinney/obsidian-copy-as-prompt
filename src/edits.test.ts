import { describe, expect, it } from 'bun:test';

import { applyEdits, rebaseEdits, type Edit } from './edits.js';

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

  it('clips an edit that straddles the window edge', () => {
    // Dropping it left the straddled text in the slice, which for a link to an
    // excluded note is the filename the placeholder exists to withhold.
    expect(rebaseEdits(edits, 15, 40)).toEqual([
      { start: 0, end: 5, replacement: 'B' },
      { start: 15, end: 25, replacement: 'C' },
    ]);
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

  it('clips a straddling replacement rather than leaving its text behind', () => {
    const link = { start: 4, end: 26, replacement: '@path' };

    expect(rebaseEdits([link], 8, 30)).toEqual([{ start: 0, end: 18, replacement: '@path' }]);
  });
});

/**
 * Deterministic pseudo-random source, so a failure is reproducible.
 *
 * This exists because ranking edits against each other leaked four times in a
 * row, each time in a shape no hand-written example had covered. The property
 * is the thing that actually matters: text a redaction or a deletion covers
 * must not survive, whatever else is going on around it.
 */
function* randomEdits(seed: number): Generator<Edit[]> {
  let state = seed;
  const next = (bound: number): number => {
    state = (state * 1103515245 + 12345) % 2147483648;

    return state % bound;
  };

  for (let round = 0; round < 4000; round += 1) {
    const count = 1 + next(4);
    const edits: Edit[] = [];

    for (let index = 0; index < count; index += 1) {
      const start = next(26);
      const end = Math.min(26, start + 1 + next(12));
      const kind = next(3);

      edits.push(
        kind === 0
          ? { start, end, replacement: '' }
          : kind === 1
            ? { start, end, replacement: '#', priority: 1 }
            : { start, end, replacement: '@' },
      );
    }

    yield edits;
  }
}

const SOURCE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

describe('applyEdits invariants under random input', () => {
  it('never leaves text a redaction or deletion covered', () => {
    for (const edits of randomEdits(7)) {
      const output = applyEdits(SOURCE, edits);

      const covered = new Set<string>();

      for (const edit of edits) {
        if (edit.replacement !== '' && (edit.priority ?? 0) === 0) continue;

        for (let index = edit.start; index < edit.end; index += 1) covered.add(SOURCE[index]!);
      }

      for (const letter of covered) {
        if (output.includes(letter)) {
          throw new Error(
            `"${letter}" survived: edits ${JSON.stringify(edits)} produced "${output}"`,
          );
        }
      }
    }
  });

  it('never emits a character the source did not contain', () => {
    for (const edits of randomEdits(11)) {
      const output = applyEdits(SOURCE, edits);

      expect(output.replaceAll(/[#@]/g, '')).toMatch(/^[A-Z]*$/);
    }
  });

  it('keeps the output ordered as the source was', () => {
    for (const edits of randomEdits(13)) {
      const letters = applyEdits(SOURCE, edits).replaceAll(/[^A-Z]/g, '');

      expect(letters.split('').toSorted().join('')).toBe(letters);
    }
  });
});
