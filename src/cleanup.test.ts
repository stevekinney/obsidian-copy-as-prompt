import { describe, expect, it } from 'bun:test';

import { commentEdits, dynamicBlockEdits, tidy } from './cleanup.js';
import { applyEdits } from './edits.js';

/** Apply a set of edits so assertions read as before/after text. */
const strip = (source: string, edits: ReturnType<typeof commentEdits>): string =>
  applyEdits(source, edits);

describe('commentEdits', () => {
  it('removes an inline comment', () => {
    const source = 'Ship it %%not really%% today';
    expect(strip(source, commentEdits(source))).toBe('Ship it  today');
  });

  it('removes a comment spanning lines, taking its trailing newline', () => {
    const source = 'Before\n%%\nprivate\nthinking\n%%\nAfter';
    expect(strip(source, commentEdits(source))).toBe('Before\nAfter');
  });

  it('does not let a stray %% pair with a later comment', () => {
    // The permissive form deleted everything between a stray delimiter and the
    // *opening* of a real comment, then emitted the comment's text.
    const source = 'printf("100%%\\n");\n\nConfidential paragraph.\n\n%%private note%%';
    const result = strip(source, commentEdits(source));

    expect(result).toContain('Confidential paragraph.');
    expect(result).not.toContain('private note');
  });

  it('pairs delimiters rather than swallowing everything between the first and last', () => {
    const source = 'a %%one%% b %%two%% c';
    expect(strip(source, commentEdits(source))).toBe('a  b  c');
  });

  it('finds nothing in a note without comments', () => {
    expect(commentEdits('Just prose.')).toEqual([]);
  });
});

describe('dynamicBlockEdits', () => {
  it('removes a dataview block along with its trailing newline', () => {
    const source = 'Before\n```dataview\nTABLE file.mtime\n```\nAfter';
    expect(strip(source, dynamicBlockEdits(source))).toBe('Before\nAfter');
  });

  it('removes a dataviewjs block', () => {
    const source = '```dataviewjs\ndv.list([1])\n```\n';
    expect(strip(source, dynamicBlockEdits(source))).toBe('');
  });

  it('removes an inline dataview expression', () => {
    const source = 'Modified `= this.file.mtime` recently';
    expect(strip(source, dynamicBlockEdits(source))).toBe('Modified  recently');
  });

  it('removes an inline dataviewjs expression', () => {
    const source = 'Count `$= dv.pages().length` items';
    expect(strip(source, dynamicBlockEdits(source))).toBe('Count  items');
  });

  it('removes templater expressions', () => {
    const source = 'Written <% tp.date.now() %> by <%* tp.user.me() %>.';
    expect(strip(source, dynamicBlockEdits(source))).toBe('Written  by .');
  });

  it('leaves an ordinary code fence alone', () => {
    const source = '```ts\nconst x = 1;\n```';
    expect(strip(source, dynamicBlockEdits(source))).toBe(source);
  });

  it('leaves code spans that merely start with = alone', () => {
    // This regex used to match any code span beginning with `=`, silently
    // deleting arrow functions and spreadsheet formulas.
    for (const source of ['Use `=>` here', 'Try `=SUM(A1:B2)` now', 'Not `=== ` either']) {
      expect(strip(source, dynamicBlockEdits(source))).toBe(source);
    }
  });

  it('strips a dataview block written with CRLF line endings', () => {
    const source = 'Before\r\n```dataview\r\nTABLE x\r\n```\r\nAfter';
    expect(strip(source, dynamicBlockEdits(source))).toBe('Before\r\nAfter');
  });

  it('leaves an ordinary code span alone', () => {
    const source = 'Call `render()` first';
    expect(strip(source, dynamicBlockEdits(source))).toBe(source);
  });
});

describe('tidy', () => {
  it('removes the trailing spaces a deleted tag leaves behind', () => {
    expect(tidy('Shipped the thing  \nNext line')).toBe('Shipped the thing\nNext line');
  });

  it('collapses runs of blank lines', () => {
    expect(tidy('A\n\n\n\n\nB')).toBe('A\n\nB');
  });

  it('trims the whole string', () => {
    expect(tidy('\n\n  Body  \n\n')).toBe('Body');
  });

  it('collapses blank runs written with CRLF', () => {
    expect(tidy('A\r\n\r\n\r\n\r\nB')).toBe('A\n\nB');
  });

  it('collapses the double space a removed tag leaves mid-sentence', () => {
    expect(tidy('Shipped  today')).toBe('Shipped today');
  });

  it('preserves a single blank line between paragraphs', () => {
    expect(tidy('A\n\nB')).toBe('A\n\nB');
  });
});
