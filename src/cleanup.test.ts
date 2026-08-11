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

  it('removes a comment spanning lines', () => {
    const source = 'Before\n%%\nprivate\nthinking\n%%\nAfter';
    expect(strip(source, commentEdits(source))).toBe('Before\n\nAfter');
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

  it('preserves a single blank line between paragraphs', () => {
    expect(tidy('A\n\nB')).toBe('A\n\nB');
  });
});
