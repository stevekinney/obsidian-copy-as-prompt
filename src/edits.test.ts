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
 * `Math.imul` and the unsigned shift keep this inside 32 bits. The obvious
 * `state * 1103515245 + 12345` overflows 2^53, the low bits collapse to zero
 * within a few iterations, and the generator quietly stops generating: an
 * earlier version of this test produced a single edit in 99.6% of rounds, so
 * the property guarding *interaction between* edits almost never saw two.
 * `generates overlapping sets often enough to matter` exists to catch that
 * happening again — a fuzz test that stops fuzzing is worse than none.
 */
function makeRandom(seed: number): (bound: number) => number {
  let state = seed >>> 0;

  return (bound) => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;

    return Math.floor((state / 4294967296) * bound);
  };
}

const SOURCE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
// Deliberately letter-free: a marker containing a letter from SOURCE would
// make the leak check see its own replacement text and report a false failure.
const MARKERS = /<1>|<2>/g;

/** Random deletions and redactions, whose result is exactly predictable. */
function removalSets(seed: number, rounds = 20_000): Edit[][] {
  const next = makeRandom(seed);

  return Array.from({ length: rounds }, () => {
    const count = 1 + next(4);

    return Array.from({ length: count }, () => {
      const start = next(SOURCE.length);
      const end = Math.min(SOURCE.length, start + 1 + next(12));

      return next(2) === 0
        ? { start, end, replacement: '' }
        : { start, end, replacement: '<1>', priority: 1 };
    });
  });
}

describe('applyEdits under random input', () => {
  it('generates overlapping sets often enough to matter', () => {
    const overlapping = removalSets(7).filter((edits) =>
      edits.some((a, i) => edits.some((b, j) => j !== i && a.start < b.end && b.start < a.end)),
    );

    expect(overlapping.length).toBeGreaterThan(5000);
  });

  it('keeps exactly the characters no edit covered, in order', () => {
    // Two-sided on purpose. Asserting only that covered text is absent is
    // satisfied by returning the empty string, so it cannot see over-removal —
    // and destroying the note is as much a bug as leaking it.
    for (const edits of removalSets(7)) {
      const covered = new Set<number>();

      for (const edit of edits) {
        for (let index = edit.start; index < edit.end; index += 1) covered.add(index);
      }

      const expected = SOURCE.split('')
        .filter((_, index) => !covered.has(index))
        .join('');

      const actual = applyEdits(SOURCE, edits).replaceAll(MARKERS, '');

      if (actual !== expected) {
        throw new Error(`expected "${expected}", got "${actual}" from ${JSON.stringify(edits)}`);
      }
    }
  });

  it('never splices a fragment of one marker into another', () => {
    // Multi-character markers on purpose: single-character replacements
    // truncate cleanly on an overlap and hide this entirely.
    for (const edits of removalSets(11)) {
      const output = applyEdits(SOURCE, edits);

      expect(output.replaceAll(MARKERS, '')).toMatch(/^[A-Z]*$/);
    }
  });

  it('holds when a rewrite is in the mix', () => {
    // Rewrites make exact reconstruction ambiguous — whether one survives
    // depends on resolution — so this keeps the one-sided property for them.
    const next = makeRandom(13);

    for (let round = 0; round < 20_000; round += 1) {
      const edits: Edit[] = Array.from({ length: 1 + next(4) }, () => {
        const start = next(SOURCE.length);
        const end = Math.min(SOURCE.length, start + 1 + next(12));
        const kind = next(3);

        return kind === 0
          ? { start, end, replacement: '' }
          : kind === 1
            ? { start, end, replacement: '<1>', priority: 1 }
            : { start, end, replacement: '<2>' };
      });

      const output = applyEdits(SOURCE, edits);

      for (const edit of edits) {
        if (edit.replacement !== '' && (edit.priority ?? 0) === 0) continue;

        for (let index = edit.start; index < edit.end; index += 1) {
          if (output.includes(SOURCE[index]!)) {
            throw new Error(`"${SOURCE[index]}" survived ${JSON.stringify(edits)} -> "${output}"`);
          }
        }
      }
    }
  });
});

describe('rebaseEdits under random input', () => {
  it('clips so the window behaves as the whole note would', () => {
    // Clipping is the least-guarded code here and had only hand-written cases.
    const next = makeRandom(17);

    for (const edits of removalSets(19, 10_000)) {
      const from = next(SOURCE.length);
      const to = Math.min(SOURCE.length, from + 1 + next(SOURCE.length));
      const window = SOURCE.slice(from, to);

      const covered = new Set<number>();

      for (const edit of edits) {
        for (let index = Math.max(edit.start, from); index < Math.min(edit.end, to); index += 1) {
          covered.add(index);
        }
      }

      const expected = window
        .split('')
        .filter((_, index) => !covered.has(index + from))
        .join('');

      const actual = applyEdits(window, rebaseEdits(edits, from, to)).replaceAll(MARKERS, '');

      if (actual !== expected) {
        throw new Error(
          `window [${from},${to}) expected "${expected}", got "${actual}" from ${JSON.stringify(edits)}`,
        );
      }
    }
  });
});
