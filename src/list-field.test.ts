import { describe, expect, it } from 'bun:test';

import { parseLines, parseList } from './list-field.js';

describe('parseList', () => {
  it('splits on commas and newlines', () => {
    expect(parseList('a, b\nc')).toEqual(['a', 'b', 'c']);
  });

  it('trims and drops empties', () => {
    expect(parseList(' a ,, \n b ')).toEqual(['a', 'b']);
  });

  it('returns nothing for an empty field', () => {
    expect(parseList('   ')).toEqual([]);
  });
});

describe('parseLines', () => {
  it('keeps a comma inside a regex quantifier intact', () => {
    // Comma-splitting turned one pattern into two invalid fragments that
    // compiled to nothing and redacted nothing, with no error anywhere.
    expect(parseLines(String.raw`\d{3,5}`)).toEqual([String.raw`\d{3,5}`]);
  });

  it('splits only on newlines', () => {
    expect(parseLines('a, b\nc')).toEqual(['a, b', 'c']);
  });

  it('trims and drops blank lines', () => {
    expect(parseLines(' a \n\n b ')).toEqual(['a', 'b']);
  });
});
