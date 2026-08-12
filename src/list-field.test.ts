import { describe, expect, it } from 'bun:test';

import { parseList } from './list-field.js';

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
