import { describe, expect, it } from 'bun:test';

import { DEFAULT_SETTINGS, MAX_EMBED_DEPTH, parseSettings } from './settings.js';

describe('parseSettings', () => {
  it('returns defaults for a fresh install', () => {
    // `loadData()` resolves to null when data.json does not exist yet.
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults for a non-object', () => {
    expect(parseSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps a valid stored blob', () => {
    const stored = { ...DEFAULT_SETTINGS, template: '{{title}}', stripTags: false };
    expect(parseSettings(stored)).toEqual(stored);
  });

  it('fills in a field an older version never wrote', () => {
    const settings = parseSettings({ template: '{{content}}' });

    expect(settings.template).toBe('{{content}}');
    expect(settings.pathStyle).toBe(DEFAULT_SETTINGS.pathStyle);
  });

  it('recovers the good fields when one is the wrong type', () => {
    const settings = parseSettings({ template: '{{title}}', fenceContent: 'yes' });

    expect(settings.template).toBe('{{title}}');
    expect(settings.fenceContent).toBe(DEFAULT_SETTINGS.fenceContent);
  });

  it('accepts a known path style', () => {
    expect(parseSettings({ pathStyle: 'vault-relative' }).pathStyle).toBe('vault-relative');
  });

  it('rejects an unknown path style', () => {
    expect(parseSettings({ pathStyle: 'relative-to-cwd' }).pathStyle).toBe(
      DEFAULT_SETTINGS.pathStyle,
    );
  });

  it('clamps an embed depth above the maximum', () => {
    // An unbounded depth on a densely linked vault is an accidental denial of
    // service against your own clipboard.
    expect(parseSettings({ embedDepth: 99 }).embedDepth).toBe(MAX_EMBED_DEPTH);
  });

  it('clamps a negative embed depth to zero', () => {
    expect(parseSettings({ embedDepth: -3 }).embedDepth).toBe(0);
  });

  it('truncates a fractional embed depth', () => {
    expect(parseSettings({ embedDepth: 2.7 }).embedDepth).toBe(2);
  });

  it('rejects a non-finite number', () => {
    expect(parseSettings({ embedDepth: Number.NaN }).embedDepth).toBe(DEFAULT_SETTINGS.embedDepth);
  });

  it('keeps a custom folder note limit', () => {
    expect(parseSettings({ folderNoteLimit: 100 }).folderNoteLimit).toBe(100);
  });
});

describe('parseSettings migration and new fields', () => {
  it('reads the boolean an earlier version wrote for preview', () => {
    // The setting changed from a boolean to a three-way mode. Without this,
    // upgrading silently resets whatever the user had chosen.
    expect(parseSettings({ previewBeforeCopy: true }).previewMode).toBe('always');
    expect(parseSettings({ previewBeforeCopy: false }).previewMode).toBe('never');
  });

  it('prefers the new field when both are present', () => {
    expect(parseSettings({ previewBeforeCopy: true, previewMode: 'large' }).previewMode).toBe(
      'large',
    );
  });

  it('rejects an unknown preview mode', () => {
    expect(parseSettings({ previewMode: 'sometimes' }).previewMode).toBe(
      DEFAULT_SETTINGS.previewMode,
    );
  });

  it('accepts the tilde-free path style', () => {
    expect(parseSettings({ pathStyle: 'absolute-full' }).pathStyle).toBe('absolute-full');
  });

  it('keeps a path prefix override', () => {
    expect(parseSettings({ pathPrefix: '/workspace/vault' }).pathPrefix).toBe('/workspace/vault');
  });

  it('keeps a custom argument limit', () => {
    expect(parseSettings({ cliArgumentLimit: 8000 }).cliArgumentLimit).toBe(8000);
  });

  it('falls back for a non-numeric argument limit', () => {
    expect(parseSettings({ cliArgumentLimit: 'lots' }).cliArgumentLimit).toBe(
      DEFAULT_SETTINGS.cliArgumentLimit,
    );
  });

  it('defaults to attempting the macOS image path', () => {
    expect(parseSettings({}).attachImageFiles).toBe(true);
  });

  it('defaults to withholding the name of an excluded note', () => {
    expect(parseSettings({}).nameExcluded).toBe(false);
  });
});
