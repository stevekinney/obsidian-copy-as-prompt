import { describe, expect, it } from 'bun:test';

import { CLI_PROFILES, findProfile, matchNames } from './cli-profiles.js';

describe('CLI_PROFILES', () => {
  it('has unique ids', () => {
    expect(new Set(CLI_PROFILES.map((profile) => profile.id)).size).toBe(CLI_PROFILES.length);
  });

  it('names every profile and explains what it is', () => {
    expect(CLI_PROFILES.every((profile) => profile.name.length > 0)).toBe(true);
    expect(CLI_PROFILES.every((profile) => profile.note.length > 0)).toBe(true);
  });

  it('lists flag names without leading dashes', () => {
    // The dashes are added when the flag is built, so a name carrying its own
    // would produce `----model`.
    const names = CLI_PROFILES.flatMap((profile) => profile.knownFlags.split(',')).map((n) =>
      n.trim(),
    );

    expect(names.every((name) => !name.startsWith('-'))).toBe(true);
  });

  it('gives Claude Code an absolute path style, since --add-dir does not move you', () => {
    expect(findProfile('claude')?.pathStyle).toBe('absolute');
    expect(findProfile('claude')?.directoryFlag).toBe('add-dir');
  });

  it('gives Codex vault-relative paths, since --cd makes the vault the working directory', () => {
    expect(findProfile('codex')?.pathStyle).toBe('vault-relative');
    expect(findProfile('codex')?.directoryFlag).toBe('cd');
  });

  it('does not forward effort to Codex, where it is a config override not a flag', () => {
    expect(findProfile('codex')?.forwardKeys).not.toContain('effort');
    expect(findProfile('claude')?.forwardKeys).toContain('effort');
  });

  it('leaves the custom profile blank', () => {
    const custom = findProfile('custom');

    expect(custom?.command).toBe('');
    expect(custom?.knownFlags).toBe('');
  });

  it('offers a profile for each tool asked for', () => {
    const ids = CLI_PROFILES.map((profile) => profile.id);

    expect(ids).toEqual(['claude', 'codex', 'gemini', 'copilot', 'custom']);
  });
});

describe('findProfile', () => {
  it('finds a built-in profile', () => {
    expect(findProfile('gemini')?.command).toBe('gemini');
  });

  it('returns null for an unknown id', () => {
    expect(findProfile('not-a-tool')).toBeNull();
  });
});

describe('matchNames', () => {
  const available = ['model', 'permission-mode', 'max-turns', 'sandbox'];

  it('ranks a prefix match above a substring match', () => {
    expect(matchNames('mo', available)).toEqual(['model', 'permission-mode']);
  });

  it('ignores leading dashes in the query', () => {
    expect(matchNames('--sand', available)).toEqual(['sandbox']);
  });

  it('is case-insensitive', () => {
    expect(matchNames('MODEL', available)).toEqual(['model']);
  });

  it('returns everything for an empty query', () => {
    expect(matchNames('', available)).toEqual(available);
  });

  it('omits names already chosen', () => {
    expect(matchNames('mo', available, ['model'])).toEqual(['permission-mode']);
  });

  it('returns nothing when the tool has no known flags', () => {
    // A tool the plugin has never heard of simply offers no suggestions.
    expect(matchNames('mo', [])).toEqual([]);
  });
});
