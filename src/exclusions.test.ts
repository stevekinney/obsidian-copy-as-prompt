import { describe, expect, it } from 'bun:test';

import { applyEdits } from './edits.js';
import { isExcluded, redactionEdits, NO_EXCLUSIONS } from './exclusions.js';

const rules = { tags: ['#private'], folders: ['Personal'], patterns: [] };

describe('isExcluded', () => {
  it('excludes nothing when there are no rules', () => {
    expect(isExcluded({ path: 'Personal/Diary.md', tags: ['#private'] }, NO_EXCLUSIONS)).toBe(
      false,
    );
  });

  it('excludes a note in a listed folder', () => {
    expect(isExcluded({ path: 'Personal/Diary.md', tags: [] }, rules)).toBe(true);
  });

  it('excludes a note nested deeper in a listed folder', () => {
    expect(isExcluded({ path: 'Personal/2026/March.md', tags: [] }, rules)).toBe(true);
  });

  it('excludes a matching folder found at any depth', () => {
    // The field asks for bare folder names and promises they hold however the
    // note was reached, so anchoring at the vault root would be a lie.
    expect(isExcluded({ path: 'Work/Personal/Notes.md', tags: [] }, rules)).toBe(true);
  });

  it('matches a multi-segment folder rule', () => {
    const nested = { ...rules, folders: ['Work/Journal'] };

    expect(isExcluded({ path: 'Work/Journal/Mon.md', tags: [] }, nested)).toBe(true);
    expect(isExcluded({ path: 'Journal/Mon.md', tags: [] }, nested)).toBe(false);
  });

  it('tolerates a relative-looking folder rule', () => {
    expect(
      isExcluded({ path: 'Personal/A.md', tags: [] }, { ...rules, folders: ['./Personal'] }),
    ).toBe(true);
  });

  it('does not exclude a folder that merely shares a prefix', () => {
    // `Personal-projects` is a different folder from `Personal`.
    expect(isExcluded({ path: 'Personal-projects/Ideas.md', tags: [] }, rules)).toBe(false);
  });

  it('matches folders case-insensitively', () => {
    expect(isExcluded({ path: 'personal/Diary.md', tags: [] }, rules)).toBe(true);
  });

  it('tolerates slashes around a folder rule', () => {
    expect(
      isExcluded({ path: 'Personal/A.md', tags: [] }, { ...rules, folders: ['/Personal/'] }),
    ).toBe(true);
  });

  it('ignores an empty folder rule rather than excluding everything', () => {
    expect(isExcluded({ path: 'Work/A.md', tags: [] }, { ...rules, folders: ['/'] })).toBe(false);
  });

  it('excludes a note carrying a listed tag', () => {
    expect(isExcluded({ path: 'Work/A.md', tags: ['#private'] }, rules)).toBe(true);
  });

  it('excludes a nested tag beneath a listed one', () => {
    // Nesting must not become a way to slip past the rule.
    expect(isExcluded({ path: 'Work/A.md', tags: ['#private/health'] }, rules)).toBe(true);
  });

  it('matches a rule written without the hash', () => {
    expect(
      isExcluded({ path: 'Work/A.md', tags: ['#Private'] }, { ...rules, tags: ['private'] }),
    ).toBe(true);
  });

  it('does not exclude an unrelated tag sharing a prefix', () => {
    expect(isExcluded({ path: 'Work/A.md', tags: ['#privateer'] }, rules)).toBe(false);
  });

  it('allows a note matching nothing', () => {
    expect(isExcluded({ path: 'Work/A.md', tags: ['#work'] }, rules)).toBe(false);
  });
});

describe('redactionEdits', () => {
  it('replaces every match', () => {
    const source = 'Call 555-0100 or 555-0111.';
    const edits = redactionEdits(source, [String.raw`\d{3}-\d{4}`]);

    expect(applyEdits(source, edits)).toBe('Call [redacted] or [redacted].');
  });

  it('applies several patterns', () => {
    const source = 'user@example.com and 555-0100';
    const edits = redactionEdits(source, [String.raw`\S+@\S+\.\w+`, String.raw`\d{3}-\d{4}`]);

    expect(applyEdits(source, edits)).toBe('[redacted] and [redacted]');
  });

  it('skips an invalid pattern and keeps the rest', () => {
    // A typo in a settings field must not break copying.
    const source = 'Call 555-0100.';
    const edits = redactionEdits(source, ['[unclosed', String.raw`\d{3}-\d{4}`]);

    expect(applyEdits(source, edits)).toBe('Call [redacted].');
  });

  it('ignores a pattern that matches nothing', () => {
    expect(redactionEdits('nothing here', ['zzz'])).toEqual([]);
  });

  it('fuses two patterns matching overlapping text', () => {
    // Contending for the same range used to leave one pattern's tail behind.
    const source = 'The Acme Corporation ships things.';
    const edits = redactionEdits(source, ['Acme Corp', 'Corporation']);

    expect(applyEdits(source, edits)).toBe('The [redacted] ships things.');
  });

  it('outranks an edit it overlaps rather than being dropped', () => {
    // A redaction that loses an overlap leaves exactly the text it existed to
    // remove, so it carries priority over link rewriting and frontmatter.
    const source = 'Mail bob@example.com now';
    const edits = redactionEdits(source, [String.raw`\S+@\S+`]);
    const other = { start: 0, end: 9, replacement: 'LINK' };

    expect(applyEdits(source, [other, ...edits])).toBe('Mail [redacted] now');
  });

  it('ignores a zero-width match', () => {
    // `a*` matches the empty string everywhere; editing those would be endless.
    expect(redactionEdits('bbb', ['a*'])).toEqual([]);
  });
});

describe('tag rules written with a trailing slash', () => {
  it('still matches, as the adjacent folder field does', () => {
    // Two neighbouring settings disagreeing about a plausible typo fails open.
    const trailing = { tags: ['#private/'], folders: [], patterns: [] };

    expect(isExcluded({ path: 'a.md', tags: ['#private/health'] }, trailing)).toBe(true);
    expect(isExcluded({ path: 'a.md', tags: ['#private'] }, trailing)).toBe(true);
  });
});
