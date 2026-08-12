import { describe, expect, it } from 'bun:test';

import { formatList, parseList, withEntry, withoutEntry } from './list-field.js';

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

describe('formatList', () => {
  it('joins entries', () => {
    expect(formatList(['a', 'b'])).toBe('a, b');
  });

  it('renders an empty list as an empty field', () => {
    expect(formatList([])).toBe('');
  });
});

describe('withEntry', () => {
  it('appends to an existing field', () => {
    expect(withEntry('model', 'effort')).toBe('model, effort');
  });

  it('starts an empty field', () => {
    expect(withEntry('', 'model')).toBe('model');
  });

  it('ignores a duplicate', () => {
    expect(withEntry('model, effort', 'model')).toBe('model, effort');
  });

  it('strips leading dashes so a pasted flag works', () => {
    expect(withEntry('', '--max-turns')).toBe('max-turns');
  });

  it('ignores an empty addition', () => {
    expect(withEntry('model', '   ')).toBe('model');
  });

  it('normalizes the separators of the existing field', () => {
    expect(withEntry('model\neffort', 'agent')).toBe('model, effort, agent');
  });
});

describe('withoutEntry', () => {
  it('removes an entry', () => {
    expect(withoutEntry('model, effort, agent', 'effort')).toBe('model, agent');
  });

  it('leaves the field alone when the entry is absent', () => {
    expect(withoutEntry('model', 'effort')).toBe('model');
  });

  it('can empty the field', () => {
    expect(withoutEntry('model', 'model')).toBe('');
  });
});
