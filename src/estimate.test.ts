import { describe, expect, it } from 'bun:test';

import { compact, describe as describeSize, estimateTokens, measure } from './estimate.js';

describe('estimateTokens', () => {
  it('uses four characters per token', () => {
    expect(estimateTokens('abcdefgh')).toBe(2);
  });

  it('rounds a partial token up', () => {
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('is zero for empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('compact', () => {
  it('leaves small numbers alone', () => {
    expect(compact(840)).toBe('840');
  });

  it('gives one decimal below ten thousand', () => {
    expect(compact(4200)).toBe('4.2k');
  });

  it('rounds to whole thousands above that', () => {
    expect(compact(128_400)).toBe('128k');
  });

  it('handles the boundary', () => {
    expect(compact(1000)).toBe('1.0k');
    expect(compact(10_000)).toBe('10k');
  });
});

describe('describe', () => {
  it('summarizes tokens and notes', () => {
    expect(describeSize(measure('x'.repeat(16_800), 3, 0))).toBe('~4.2k tokens · 3 notes');
  });

  it('mentions images when there are any', () => {
    expect(describeSize(measure('abcd', 1, 2))).toBe('~1 tokens · 1 note · 2 images');
  });

  it('singularizes a lone note', () => {
    expect(describeSize(measure('abcd', 1, 0))).toBe('~1 tokens · 1 note');
  });

  it('reports the raw character count too', () => {
    expect(measure('abcd', 1, 0)).toEqual({ characters: 4, tokens: 1, notes: 1, images: 0 });
  });
});
