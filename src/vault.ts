import {
  FileSystemAdapter,
  getAllTags,
  parseLinktext,
  TFile,
  type App,
  type CachedMetadata,
  type ReferenceCache,
} from 'obsidian';

import { buildCanvasBody } from './canvas-body.js';
import { organizeCanvas, parseCanvas } from './canvas.js';
import { homeDirectory } from './desktop.js';
import type { Edit } from './edits.js';
import { isExcluded, redactionEdits, type ExclusionRules } from './exclusions.js';
import { displayPath, type PathStyle } from './paths.js';
import type { NoteBody, NoteReference, ResolvedTarget } from './references.js';
import type { RenderableNote } from './render.js';

/**
 * Turning Obsidian's world into the plain data the renderer consumes.
 *
 * This is the only module that touches the Vault or the metadata cache. It
 * resolves every link and applies exclusion rules, then hands the renderer a
 * structure with no Obsidian types in it at all, which is what makes the
 * rendering testable.
 */

/** Where the vault lives on disk, and where to anchor `~`. */
export type VaultContext = {
  /** The vault's real location. */
  basePath: string;
  /**
   * The location emitted paths are built from. Usually the same as `basePath`,
   * but overridable for a reader that sees the vault somewhere else entirely —
   * WSL, a container, the far end of an SSH session.
   */
  displayBase: string;
  home: string;
};

/** How to resolve a note into renderable data. */
export type ResolveOptions = {
  context: VaultContext;
  pathStyle: PathStyle;
  stripFrontmatter: boolean;
  stripTags: boolean;
  /** How many hops of links to follow. Zero means none. */
  linkDepth: number;
  exclusions: ExclusionRules;
};

/**
 * The vault's location on disk, or null when there isn't one.
 *
 * Only the desktop app has a real filesystem path. On mobile the adapter is not
 * a `FileSystemAdapter`, so every path-producing feature is gated off rather
 * than emitting something that looks like a path and isn't.
 */
export function vaultContext(app: App): VaultContext | null {
  const { adapter } = app.vault;

  if (!(adapter instanceof FileSystemAdapter)) return null;

  const basePath = adapter.getBasePath();

  return { basePath, displayBase: basePath, home: homeDirectory() };
}

/** Whether exclusion rules withhold this file. */
export function isFileExcluded(app: App, file: TFile, rules: ExclusionRules): boolean {
  const cache = app.metadataCache.getFileCache(file);
  const tags = cache ? (getAllTags(cache) ?? []) : [];

  return isExcluded({ path: file.path, tags }, rules);
}

/**
 * Edits derived from the metadata cache rather than from matching text.
 *
 * The cache is what makes tag removal safe: it knows a `#tag` from a `#heading`
 * and from a `#` inside a code span, which no regex over the raw text does.
 */
/**
 * The frontmatter removal, if the block is still where the cache says.
 *
 * The cache describes the file as last parsed, and unsaved edits move
 * everything below them. Deleting this range unchecked meant a selection from a
 * note with unsaved frontmatter cut the wrong window and emitted the part of
 * the block it missed.
 */
function frontmatterEdit(content: string, cache: CachedMetadata | null): Edit | null {
  const position = cache?.frontmatterPosition;

  if (!position) return null;

  const from = position.start.offset;
  const after = position.end.offset;
  const block = content.slice(from, after);

  if (!block.startsWith('---') || !block.trimEnd().endsWith('---')) return null;

  // Take the newline after the closing `---` too, so the body doesn't start
  // with a blank line — both halves of it on a CRLF file.
  const end = content.startsWith('\r\n', after) ? after + 2 : after + 1;

  return { start: from, end, replacement: '' };
}

/** Tag removals, skipping any whose offset no longer holds the tag. */
function tagEdits(content: string, cache: CachedMetadata | null): Edit[] {
  const edits: Edit[] = [];

  for (const tag of cache?.tags ?? []) {
    const { start, end } = tag.position;

    if (content.slice(start.offset, end.offset) !== tag.tag) continue;

    // Swallow the space *after* the tag, not the one before. Reaching backwards
    // made this edit overlap whatever owned the preceding character, and the tag
    // edit was the one dropped — so the tag survived. Reaching forward leaves
    // `Shipped #work today` as `Shipped today` without a global whitespace pass
    // that would wreck code blocks.
    const to = content[end.offset] === ' ' ? end.offset + 1 : end.offset;

    edits.push({ start: start.offset, end: to, replacement: '' });
  }

  return edits;
}

/**
 * Edits derived from the metadata cache rather than from matching text.
 *
 * The cache is what makes tag removal safe: it knows a `#tag` from a `#heading`
 * and from a `#` inside a code span, which no regex over the raw text does.
 */
function cacheEdits(
  content: string,
  cache: CachedMetadata | null,
  options: ResolveOptions,
): Edit[] {
  const frontmatter = options.stripFrontmatter ? frontmatterEdit(content, cache) : null;

  return [
    ...redactionEdits(content, options.exclusions.patterns),
    ...(frontmatter ? [frontmatter] : []),
    ...(options.stripTags ? tagEdits(content, cache) : []),
  ];
}

function targetFor(app: App, destination: TFile, options: ResolveOptions): ResolvedTarget {
  return {
    vaultPath: destination.path,
    displayPath: displayPath(destination.path, options.context, options.pathStyle),
    excluded: isFileExcluded(app, destination, options.exclusions),
  };
}

/** Resolve a link's target, or null when it points at nothing. */
export function resolveTarget(
  app: App,
  from: TFile,
  linkpath: string,
  options: ResolveOptions,
): ResolvedTarget | null {
  if (!linkpath) return null;

  const destination = app.metadataCache.getFirstLinkpathDest(linkpath, from.path);

  return destination ? targetFor(app, destination, options) : null;
}

function resolveReference(
  app: App,
  file: TFile,
  item: ReferenceCache,
  options: ResolveOptions,
): NoteReference {
  const { path, subpath } = parseLinktext(item.link);

  return {
    start: item.position.start.offset,
    end: item.position.end.offset,
    original: item.original,
    anchor: subpath ? subpath.replace(/^#/, '') : undefined,
    target: resolveTarget(app, file, path, options),
  };
}

/**
 * Move cached references onto the text they actually describe.
 *
 * Offsets come from the metadata cache, which describes the file as last
 * parsed; unsaved edits above a link move everything below it. Rewriting at a
 * stale offset corrupts whatever now sits there, so each reference is located
 * by its own recorded text instead, searching forward from the last one placed.
 *
 * This replaces an earlier attempt that rescanned the whole note with a regex.
 * That dropped markdown-style `[text](path.md)` links entirely — which the
 * cache does index — leaking a full vault path, and it rewrote links inside
 * code fences, which the cache correctly ignores. Re-anchoring keeps both
 * properties for free.
 */
function reanchor(
  references: readonly NoteReference[],
  content: string,
): { references: NoteReference[]; uncertain: boolean } {
  const placed: NoteReference[] = [];
  let cursor = 0;
  let uncertain = false;

  for (const item of references) {
    if (content.slice(item.start, item.end) === item.original) {
      placed.push(item);
      cursor = Math.max(cursor, item.end);
      continue;
    }

    const found = content.indexOf(item.original, cursor);

    if (found < 0) {
      uncertain = true;
      continue;
    }

    placed.push({ ...item, start: found, end: found + item.original.length });
    cursor = found + item.original.length;
  }

  return { references: placed, uncertain };
}

/**
 * Whether the text holds a link the cache never told us about.
 *
 * Re-anchoring only fixes links that *moved*. Typing a new one below every
 * existing link shifts nothing, so every cached offset still validates and the
 * new link is simply absent — which is the likelier half of the cases, and the
 * one where an excluded note's name would go out unwitnessed.
 */
function hasUnaccountedLinks(content: string, references: readonly NoteReference[]): boolean {
  return [...content.matchAll(/\[\[/g)].some(
    (match) => !references.some((item) => match.index >= item.start && match.index < item.end),
  );
}

async function resolveBody(
  app: App,
  file: TFile,
  options: ResolveOptions,
  override?: string,
): Promise<NoteBody> {
  // `cachedRead` is the right call for read-only access — it serves the parsed
  // contents instead of hitting disk again. `override` carries the editor's
  // live buffer, which is ahead of disk whenever there are unsaved edits.
  const content = override ?? (await app.vault.cachedRead(file));
  const cache = app.metadataCache.getFileCache(file);

  // Links and embeds render identically, so they need no distinction here.
  const items = [...(cache?.links ?? []), ...(cache?.embeds ?? [])];

  const cached = items
    .map((item) => resolveReference(app, file, item, options))
    .toSorted((a, b) => a.start - b.start);

  const { references, uncertain } = reanchor(cached, content);

  return {
    content,
    references,
    cacheEdits: cacheEdits(content, cache, options),
    uncertain: uncertain || hasUnaccountedLinks(content, references),
  };
}

/**
 * Resolve a note into the structure the renderer consumes.
 *
 * @param app - The Obsidian app.
 * @param file - The note to resolve.
 * @param options - Path style, cleanup toggles, and exclusions.
 * @param override - Text to use instead of the file on disk, for a live editor.
 * @returns The note and its resolved references.
 */
export async function resolveNote(
  app: App,
  file: TFile,
  options: ResolveOptions,
  override?: string,
): Promise<RenderableNote> {
  return {
    title: file.basename,
    vaultPath: file.path,
    displayPath: displayPath(file.path, options.context, options.pathStyle),
    body: await resolveBody(app, file, options, override),
  };
}

/** Every Markdown note a file links to, resolved and deduplicated. */
function linkedNotes(app: App, file: TFile): TFile[] {
  const cache = app.metadataCache.getFileCache(file);
  const found = new Map<string, TFile>();

  for (const item of [...(cache?.links ?? []), ...(cache?.embeds ?? [])]) {
    const { path } = parseLinktext(item.link);

    if (!path) continue;

    const destination = app.metadataCache.getFirstLinkpathDest(path, file.path);

    if (destination?.extension === 'md') found.set(destination.path, destination);
  }

  return [...found.values()];
}

/**
 * Follow links outward from the chosen notes.
 *
 * Breadth-first so that depth means hops rather than branch order, and excluded
 * notes are dropped before they are looked at.
 *
 * Reached notes are never read. Only their path is rendered, so loading bodies
 * would mean thousands of file reads on a densely linked vault to produce a
 * bullet list — which is why this is synchronous.
 *
 * @param app - The Obsidian app.
 * @param roots - The notes the user actually chose.
 * @param options - Resolution options, including `linkDepth`.
 * @returns The reached notes, each flagged `related`.
 */
export function resolveRelated(
  app: App,
  roots: readonly TFile[],
  options: ResolveOptions,
): RenderableNote[] {
  if (options.linkDepth <= 0) return [];

  const seen = new Set(roots.map((file) => file.path));
  const reached: TFile[] = [];
  let frontier = [...roots];

  for (let hop = 0; hop < options.linkDepth; hop += 1) {
    const next: TFile[] = [];

    for (const file of frontier) {
      for (const linked of linkedNotes(app, file)) {
        if (seen.has(linked.path)) continue;

        seen.add(linked.path);

        if (isFileExcluded(app, linked, options.exclusions)) continue;

        reached.push(linked);
        next.push(linked);
      }
    }

    frontier = next;
  }

  return reached.map((file) => ({
    title: file.basename,
    vaultPath: file.path,
    displayPath: displayPath(file.path, options.context, options.pathStyle),
    body: { content: '', references: [], cacheEdits: [] },
    related: true,
  }));
}

/**
 * Resolve a canvas into a note the renderer can handle.
 *
 * @param app - The Obsidian app.
 * @param file - The `.canvas` file.
 * @param options - Resolution options.
 * @returns The canvas as a single renderable note.
 */
export async function resolveCanvas(
  app: App,
  file: TFile,
  options: ResolveOptions,
): Promise<RenderableNote> {
  const sections = organizeCanvas(parseCanvas(await app.vault.cachedRead(file)));
  const body = buildCanvasBody(sections, (path) => resolveTarget(app, file, path, options));

  return {
    title: file.basename,
    vaultPath: file.path,
    displayPath: displayPath(file.path, options.context, options.pathStyle),
    // A canvas has no metadata cache, so redaction has to be applied to the
    // synthesized body here — otherwise a pattern that scrubs notes silently
    // does nothing to text typed directly onto a canvas.
    body: { ...body, cacheEdits: redactionEdits(body.content, options.exclusions.patterns) },
  };
}
