import type { PathStyle } from './paths.js';

/**
 * Settings shape, defaults, and validation.
 *
 * Obsidian round-trips settings through `data.json` as untyped JSON, so what
 * `loadData()` returns is whatever is on disk — including data written by an
 * older version of this plugin, or by a user editing the file by hand, or
 * nothing at all on a fresh install. Everything here is deliberately
 * dependency-free: each runtime dependency is bundled into `main.js` and
 * downloaded by every user, and a schema library costs more than this file is
 * worth.
 */

/** The plugin's settings. */
export type PluginSettings = {
  /** The prompt template. Supports `{{title}}`, `{{path}}`, and `{{content}}`. */
  template: string;
  /** Whether paths are absolute (`~/…`) or relative to the vault root. */
  pathStyle: PathStyle;
  /** How many levels of `![[embeds]]` to inline in self-contained mode. */
  embedDepth: number;
  /** Whether to wrap the note body in a Markdown code fence. */
  fenceContent: boolean;
  /** Whether to lead the prompt with a line naming the source note. */
  includeHeader: boolean;
  /** Whether to drop a leading YAML frontmatter block. */
  stripFrontmatter: boolean;
  /** Whether to drop `#tags` from the prose. */
  stripTags: boolean;
  /** Whether to drop `%%Obsidian comments%%`. */
  stripComments: boolean;
  /** Whether to drop Dataview and Templater blocks. */
  stripDynamicBlocks: boolean;
  /** Ask before copying a folder containing more notes than this. */
  folderNoteLimit: number;
  /** How many hops of plain links to follow outward. Zero means none. */
  linkDepth: number;
  /** Tag names whose notes are never included. Comma or newline separated. */
  excludeTags: string;
  /** Folders whose notes are never included. */
  excludeFolders: string;
  /** Regular expressions blanked out of any included note. */
  redactPatterns: string;
  /** Which output modes appear in context menus. */
  menuModes: MenuModes;
  /** When to show the prompt for review before it reaches the clipboard. */
  previewMode: PreviewMode;
  /** With `previewMode: 'large'`, the estimated token count that triggers review. */
  previewThreshold: number;
  /** Emit a withheld note's path alongside its placeholder. */
  nameExcluded: boolean;
  /** Override the vault location that emitted paths are built from. */
  pathPrefix: string;
  /** File extensions treated as images. */
  imageExtensions: string;
  /** Attempt the macOS one-paste-attaches-all path for images. */
  attachImageFiles: boolean;
  /** The executable the CLI command starts with. */
  cliCommand: string;
  /** Frontmatter keys forwarded to the CLI as `--key value`. */
  cliForwardKeys: string;
  /** Whether the CLI command grants the session access to the vault. */
  cliAddVaultDir: boolean;
  /** The flag name granting directory access, without dashes. */
  cliAddDirFlag: string;
  /** Arguments always included, inserted verbatim. */
  cliExtraArguments: string;
  /** Prompt length beyond which the command switches to a heredoc. */
  cliArgumentLimit: number;
};

/**
 * Which output modes are offered on context menus.
 *
 * Scoped to menus on purpose. Commands stay registered whatever this says, so
 * an existing hotkey keeps working and nothing becomes unreachable — this only
 * decides what takes up space on a menu you did not go looking through.
 */
export type MenuModes = 'both' | 'paths' | 'self-contained';

const MENU_MODES: readonly MenuModes[] = ['both', 'paths', 'self-contained'];

/** When the review modal appears. */
export type PreviewMode = 'never' | 'large' | 'always';

const PREVIEW_MODES: readonly PreviewMode[] = ['never', 'large', 'always'];

/** The settings a fresh install starts with. */
export const DEFAULT_SETTINGS: PluginSettings = {
  template: '{{content}}',
  pathStyle: 'absolute',
  embedDepth: 1,
  fenceContent: false,
  includeHeader: true,
  stripFrontmatter: true,
  stripTags: true,
  stripComments: true,
  stripDynamicBlocks: true,
  folderNoteLimit: 25,
  linkDepth: 0,
  excludeTags: '',
  excludeFolders: '',
  redactPatterns: '',
  menuModes: 'both',
  previewMode: 'never',
  previewThreshold: 8000,
  nameExcluded: false,
  pathPrefix: '',
  imageExtensions: 'png, jpg, jpeg, gif, bmp, svg, webp, avif',
  attachImageFiles: true,
  cliCommand: 'claude',
  cliForwardKeys: 'model, effort',
  cliAddVaultDir: true,
  cliAddDirFlag: 'add-dir',
  cliExtraArguments: '',
  cliArgumentLimit: 100_000,
};

/** The largest embed depth the settings UI will accept. */
export const MAX_EMBED_DEPTH = 5;

/**
 * The largest link depth the settings UI will accept.
 *
 * Deliberately lower than the embed limit. Link traversal fans out — each hop
 * multiplies rather than adds — so three hops through a densely linked vault
 * can reach most of it.
 */
export const MAX_LINK_DEPTH = 3;

const PATH_STYLES: readonly PathStyle[] = ['absolute', 'absolute-full', 'vault-relative'];

/**
 * Setting names grouped by value type.
 *
 * Derived from {@link PluginSettings} rather than listed by hand, so adding a
 * setting cannot leave a validator behind — the alternative is a hand-kept
 * union that silently stops covering the field you just added.
 *
 * The `string extends` direction matters: it matches plain `string` while
 * excluding unions like `PathStyle`, which need their own validation.
 */
export type BooleanSettingKey = {
  [K in keyof PluginSettings]: PluginSettings[K] extends boolean ? K : never;
}[keyof PluginSettings];

/** Setting names whose values are free-form strings. */
export type StringSettingKey = {
  [K in keyof PluginSettings]: string extends PluginSettings[K] ? K : never;
}[keyof PluginSettings];

/** Setting names whose values are numbers. */
export type NumberSettingKey = {
  [K in keyof PluginSettings]: number extends PluginSettings[K] ? K : never;
}[keyof PluginSettings];

function isMenuModes(value: unknown): value is MenuModes {
  return MENU_MODES.some((mode) => mode === value);
}

/** Narrow a dropdown's string back to the union, falling back to the default. */
export function toMenuModes(value: unknown): MenuModes {
  return isMenuModes(value) ? value : DEFAULT_SETTINGS.menuModes;
}

function isPathStyle(value: unknown): value is PathStyle {
  return PATH_STYLES.some((style) => style === value);
}

/**
 * Read the preview setting, accepting the boolean earlier versions wrote.
 *
 * Settings that change shape have to keep reading the old shape, or upgrading
 * silently resets whatever the user had chosen.
 */
export function toPreviewMode(value: unknown): PreviewMode {
  const known = PREVIEW_MODES.find((mode) => mode === value);

  if (known) return known;
  if (typeof value === 'boolean') return value ? 'always' : 'never';

  return DEFAULT_SETTINGS.previewMode;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Validate a raw settings blob, field by field.
 *
 * Recovery is per field rather than all-or-nothing: one corrupt value falls
 * back to its default without discarding the user's other choices.
 *
 * @param source - Whatever `Plugin.loadData()` returned. May be anything.
 * @returns Valid settings. Never throws.
 */
export function parseSettings(source: unknown): PluginSettings {
  // Spread rather than cast: `data.json` can hold anything, and an assertion
  // here would be a lie the compiler then trusts everywhere downstream.
  const record: Record<string, unknown> = {
    ...(typeof source === 'object' && source !== null ? source : {}),
  };

  const boolean = (key: BooleanSettingKey): boolean =>
    typeof record[key] === 'boolean' ? record[key] : DEFAULT_SETTINGS[key];

  const text = (key: StringSettingKey): string =>
    typeof record[key] === 'string' ? record[key] : DEFAULT_SETTINGS[key];

  const counted = (key: NumberSettingKey, high: number): number =>
    typeof record[key] === 'number' && Number.isFinite(record[key])
      ? clamp(Math.trunc(record[key]), 0, high)
      : DEFAULT_SETTINGS[key];

  return {
    template: text('template'),
    pathStyle: isPathStyle(record['pathStyle']) ? record['pathStyle'] : DEFAULT_SETTINGS.pathStyle,
    embedDepth: counted('embedDepth', MAX_EMBED_DEPTH),
    folderNoteLimit: counted('folderNoteLimit', Number.MAX_SAFE_INTEGER),
    fenceContent: boolean('fenceContent'),
    includeHeader: boolean('includeHeader'),
    stripFrontmatter: boolean('stripFrontmatter'),
    stripTags: boolean('stripTags'),
    stripComments: boolean('stripComments'),
    stripDynamicBlocks: boolean('stripDynamicBlocks'),
    linkDepth: counted('linkDepth', MAX_LINK_DEPTH),
    excludeTags: text('excludeTags'),
    excludeFolders: text('excludeFolders'),
    redactPatterns: text('redactPatterns'),
    menuModes: isMenuModes(record['menuModes']) ? record['menuModes'] : DEFAULT_SETTINGS.menuModes,
    previewMode: toPreviewMode(record['previewMode'] ?? record['previewBeforeCopy']),
    previewThreshold: counted('previewThreshold', Number.MAX_SAFE_INTEGER),
    nameExcluded: boolean('nameExcluded'),
    pathPrefix: text('pathPrefix'),
    imageExtensions: text('imageExtensions'),
    attachImageFiles: boolean('attachImageFiles'),
    cliCommand: text('cliCommand'),
    cliForwardKeys: text('cliForwardKeys'),
    cliAddVaultDir: boolean('cliAddVaultDir'),
    cliAddDirFlag: text('cliAddDirFlag'),
    cliExtraArguments: text('cliExtraArguments'),
    cliArgumentLimit: counted('cliArgumentLimit', Number.MAX_SAFE_INTEGER),
  };
}

/**
 * What the settings tab needs from the plugin.
 *
 * Depending on this interface rather than on the plugin class keeps the tab
 * and `main.ts` from importing each other.
 */
export type SettingsHost = {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
};
