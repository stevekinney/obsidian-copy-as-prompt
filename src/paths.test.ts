import { describe, expect, it } from 'bun:test';

import { absolutePath, displayPath, reference, withTilde } from './paths.js';

const context = { displayBase: '/Users/steve/Vaults/notes', home: '/Users/steve' };

describe('absolutePath', () => {
  it('joins a base path and a vault path', () => {
    expect(absolutePath('/Users/steve/Vault', 'Work/Design.md')).toBe(
      '/Users/steve/Vault/Work/Design.md',
    );
  });

  it('does not double the separator when the base has a trailing slash', () => {
    expect(absolutePath('/Users/steve/Vault/', 'Design.md')).toBe('/Users/steve/Vault/Design.md');
  });
});

describe('withTilde', () => {
  it('replaces the home directory', () => {
    expect(withTilde('/Users/steve/Vaults/a.md', '/Users/steve')).toBe('~/Vaults/a.md');
  });

  it('collapses the home directory itself', () => {
    expect(withTilde('/Users/steve', '/Users/steve')).toBe('~');
  });

  it('leaves a path outside home alone', () => {
    expect(withTilde('/opt/notes/a.md', '/Users/steve')).toBe('/opt/notes/a.md');
  });

  it('does not match a sibling directory with a shared prefix', () => {
    // `/Users/steven` starts with `/Users/steve` as a string but is a different
    // account, so only a full segment match counts.
    expect(withTilde('/Users/steven/a.md', '/Users/steve')).toBe('/Users/steven/a.md');
  });

  it('leaves the path alone when home is unknown', () => {
    expect(withTilde('/Users/steve/a.md', '')).toBe('/Users/steve/a.md');
  });

  it('tolerates a trailing slash on home', () => {
    expect(withTilde('/Users/steve/a.md', '/Users/steve/')).toBe('~/a.md');
  });
});

describe('reference', () => {
  it('emits a bare @path when there are no spaces', () => {
    expect(reference('~/Vaults/Work/Design.md')).toBe('@~/Vaults/Work/Design.md');
  });

  it('wraps a path containing spaces in backticks', () => {
    // Bare, this parses as `@~/Vaults/Work/Kubernetes` plus a stray `notes.md`.
    expect(reference('~/Vaults/Work/Kubernetes notes.md')).toBe(
      '`@~/Vaults/Work/Kubernetes notes.md`',
    );
  });
});

describe('displayPath', () => {
  it('builds an absolute path with a tilde', () => {
    expect(displayPath('Work/Design.md', context, 'absolute')).toBe(
      '~/Vaults/notes/Work/Design.md',
    );
  });

  it('emits the full path without a tilde when asked', () => {
    // Inside a single-quoted shell argument nothing expands `~`, so a tool that
    // takes the path literally needs this form.
    expect(displayPath('Work/Design.md', context, 'absolute-full')).toBe(
      '/Users/steve/Vaults/notes/Work/Design.md',
    );
  });

  it('emits paths under an overridden base for a remote environment', () => {
    // The vault lives at /Users/steve/... locally, but the thing reading these
    // paths sees it at /workspace/vault.
    const remote = { displayBase: '/workspace/vault', home: '/Users/steve' };

    expect(displayPath('Work/Design.md', remote, 'absolute')).toBe(
      '/workspace/vault/Work/Design.md',
    );
  });

  it('passes the vault path straight through when vault-relative', () => {
    expect(displayPath('Work/Design.md', context, 'vault-relative')).toBe('Work/Design.md');
  });
});

describe('withTilde on Windows-style paths', () => {
  it('matches when both sides use backslashes', () => {
    // getBasePath() and homedir() both return backslashes there, and without
    // normalizing them the prefix never matched — so the `absolute` style
    // silently emitted the account name it exists to keep out.
    const path = String.raw`C:\Users\steve\Vault\Note.md`.replaceAll('\\', '/');

    expect(withTilde(path, String.raw`C:\Users\steve`)).toBe('~/Vault/Note.md');
  });

  it('normalizes a backslash base path when joining', () => {
    expect(absolutePath(String.raw`C:\Users\steve\Vault`, 'Work/Design.md')).toBe(
      'C:/Users/steve/Vault/Work/Design.md',
    );
  });
});
