import { describe, expect, it } from 'bun:test';

import { findFlag, KNOWN_FLAGS, matchFlags } from './known-flags.js';

describe('KNOWN_FLAGS', () => {
  it('has no duplicate names', () => {
    expect(new Set(KNOWN_FLAGS.map((flag) => flag.name)).size).toBe(KNOWN_FLAGS.length);
  });

  it('stores names without leading dashes', () => {
    // Frontmatter keys are bare; the dashes are added when the flag is built.
    expect(KNOWN_FLAGS.every((flag) => !flag.name.startsWith('-'))).toBe(true);
  });

  it('describes every flag', () => {
    expect(KNOWN_FLAGS.every((flag) => flag.description.length > 0)).toBe(true);
  });

  it('includes the flags this plugin leans on', () => {
    const names = KNOWN_FLAGS.map((flag) => flag.name);

    expect(names).toContain('model');
    expect(names).toContain('effort');
    expect(names).toContain('add-dir');
    expect(names).toContain('permission-mode');
  });

  it('marks bare switches as taking no value', () => {
    expect(findFlag('print')?.takesValue).toBe(false);
    expect(findFlag('continue')?.takesValue).toBe(false);
  });

  it('marks value flags as taking one', () => {
    expect(findFlag('model')?.takesValue).toBe(true);
    expect(findFlag('effort')?.takesValue).toBe(true);
  });
});

describe('matchFlags', () => {
  it('ranks a prefix match above a substring match', () => {
    // Typing `mo` should offer `model` before `permission-mode`.
    const names = matchFlags('mo').map((flag) => flag.name);

    expect(names[0]).toBe('model');
    expect(names).toContain('permission-mode');
    expect(names.indexOf('model')).toBeLessThan(names.indexOf('permission-mode'));
  });

  it('ignores leading dashes in the query', () => {
    expect(matchFlags('--eff').map((flag) => flag.name)).toEqual(['effort']);
  });

  it('is case-insensitive', () => {
    expect(matchFlags('MODEL').map((flag) => flag.name)).toContain('model');
  });

  it('returns everything for an empty query', () => {
    expect(matchFlags('')).toHaveLength(KNOWN_FLAGS.length);
  });

  it('omits names already chosen but keeps other matches', () => {
    const names = matchFlags('model', ['model']).map((flag) => flag.name);

    expect(names).not.toContain('model');
    expect(names).toContain('fallback-model');
  });

  it('returns nothing for a query matching no flag', () => {
    expect(matchFlags('zzzz')).toEqual([]);
  });
});

describe('findFlag', () => {
  it('finds a known flag', () => {
    expect(findFlag('effort')?.description).toContain('Effort level');
  });

  it('returns null for an unknown one', () => {
    // Unknown keys are still forwarded — your CLI may be a wrapper or newer
    // than this list — so this only affects whether we can describe it.
    expect(findFlag('not-a-flag')).toBeNull();
  });
});
