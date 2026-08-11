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
import { absolutePath, displayPath, type PathStyle } from './paths.js';
import type { NoteBody, NoteReference, ResolvedTarget, TargetKind } from './references.js';
import type { RenderableNote } from './render.js';

/**
 * Turning Obsidian's world into the plain data the renderer consumes.
 *
 * This is the only module that touches the Vault, the metadata cache, or the
 * filesystem. It resolves every link, decides what each one points at, applies
 * exclusion rules, and loads bodies for embeds and traversal — then hands the
 * renderer a structure with no Obsidian types in it at all, which is what makes
 * the rendering testable.
 */

/** Where the vault lives on disk, and where to anchor `~`. */
export type VaultContext = {
  /** The vault's real location, used for filesystem work such as the clipboard. */
  basePath: string;
  /**
   * The location emitted paths are built from. Usually the same as `basePath`,
   * but overridable for a reader that sees the vault somewhere else entirely —
   * WSL, a devcontainer, the far end of an SSH session.
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
  /** How many levels of embeds to load. Zero means never inline. */
  embedDepth: number;
  /** How many hops of plain links to follow. Zero means none. */
  linkDepth: number;
  exclusions: ExclusionRules;
  /** Lowercase extensions treated as images rather than generic attachments. */
  imageExtensions: ReadonlySet<string>;
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

function kindOf(file: TFile, images: ReadonlySet<string>): TargetKind {
  if (file.extension === 'md') return 'note';

  return images.has(file.extension.toLowerCase()) ? 'image' : 'attachment';
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
 * Redaction patterns are folded in here so they travel with everything else.
 */
function cacheEdits(
  content: string,
  cache: CachedMetadata | null,
  options: ResolveOptions,
): Edit[] {
  const edits: Edit[] = redactionEdits(content, options.exclusions.patterns);
  const frontmatter = cache?.frontmatterPosition;

  if (options.stripFrontmatter && frontmatter) {
    // Take the newline after the closing `---` too, so the body doesn't start
    // with a blank line.
    edits.push({
      start: frontmatter.start.offset,
      end: frontmatter.end.offset + 1,
      replacement: '',
    });
  }

  if (options.stripTags) {
    for (const tag of cache?.tags ?? []) {
      const { start, end } = tag.position;
      // Swallow one leading space so `Shipped #work today` doesn't become
      // `Shipped  today`.
      const from = content[start.offset - 1] === ' ' ? start.offset - 1 : start.offset;

      edits.push({ start: from, end: end.offset, replacement: '' });
    }
  }

  return edits;
}

function targetFor(app: App, destination: TFile, options: ResolveOptions): ResolvedTarget {
  return {
    vaultPath: destination.path,
    displayPath: displayPath(destination.path, options.context, options.pathStyle),
    absolutePath: absolutePath(options.context.basePath, destination.path),
    title: destination.basename,
    kind: kindOf(destination, options.imageExtensions),
    excluded: isFileExcluded(app, destination, options.exclusions),
  };
}

function resolveTarget(
  app: App,
  file: TFile,
  linkpath: string,
  options: ResolveOptions,
): { file: TFile; target: ResolvedTarget } | null {
  if (!linkpath) return null;

  const destination = app.metadataCache.getFirstLinkpathDest(linkpath, file.path);

  if (!destination) return null;

  return { file: destination, target: targetFor(app, destination, options) };
}

async function resolveReference(
  app: App,
  file: TFile,
  item: ReferenceCache,
  embed: boolean,
  options: ResolveOptions,
  depth: number,
  visited: ReadonlySet<string>,
): Promise<NoteReference> {
  const { path, subpath } = parseLinktext(item.link);
  const resolved = resolveTarget(app, file, path, options);

  const base: NoteReference = {
    start: item.position.start.offset,
    end: item.position.end.offset,
    original: item.original,
    anchor: subpath ? subpath.replace(/^#/, '') : undefined,
    displayText: item.displayText,
    embed,
    target: resolved?.target ?? null,
  };

  if (!resolved || !embed || resolved.target.kind !== 'note') return base;

  // An excluded note is never loaded, so its text cannot reach the prompt even
  // by accident.
  if (resolved.target.excluded) return base;

  // Depth and cycles are settled here rather than in the renderer: an embed we
  // decline to expand simply arrives without a body, and renders as text.
  if (depth >= options.embedDepth || visited.has(resolved.file.path)) return base;

  const note = await resolveBody(
    app,
    resolved.file,
    options,
    depth + 1,
    new Set([...visited, resolved.file.path]),
  );

  return { ...base, target: { ...resolved.target, note } };
}

async function resolveBody(
  app: App,
  file: TFile,
  options: ResolveOptions,
  depth: number,
  visited: ReadonlySet<string>,
): Promise<NoteBody> {
  // `cachedRead` is the right call for read-only access — it serves the parsed
  // contents instead of hitting disk again.
  const content = await app.vault.cachedRead(file);
  const cache = app.metadataCache.getFileCache(file);

  const items: { item: ReferenceCache; embed: boolean }[] = [
    ...(cache?.links ?? []).map((item) => ({ item, embed: false })),
    ...(cache?.embeds ?? []).map((item) => ({ item, embed: true })),
  ];

  const references = await Promise.all(
    items.map(({ item, embed }) =>
      resolveReference(app, file, item, embed, options, depth, visited),
    ),
  );

  return { content, references, cacheEdits: cacheEdits(content, cache, options) };
}

/**
 * Resolve a note into the structure the renderer consumes.
 *
 * @param app - The Obsidian app.
 * @param file - The note to resolve.
 * @param options - Path style, cleanup toggles, exclusions, and depths.
 * @returns The note, its references, and every embed body loaded within depth.
 */
export async function resolveNote(
  app: App,
  file: TFile,
  options: ResolveOptions,
): Promise<RenderableNote> {
  return {
    title: file.basename,
    vaultPath: file.path,
    displayPath: displayPath(file.path, options.context, options.pathStyle),
    body: await resolveBody(app, file, options, 0, new Set([file.path])),
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
 * notes are dropped before their bodies are ever read. Reached notes are loaded
 * with `embedDepth: 0`: a note two hops away expanding its own embeds is how a
 * prompt quietly becomes a megabyte.
 *
 * @param app - The Obsidian app.
 * @param roots - The notes the user actually chose.
 * @param options - Resolution options, including `linkDepth`.
 * @returns The reached notes, each flagged `related`.
 */
export async function resolveRelated(
  app: App,
  roots: readonly TFile[],
  options: ResolveOptions,
): Promise<RenderableNote[]> {
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

  const shallow: ResolveOptions = { ...options, embedDepth: 0, linkDepth: 0 };

  return Promise.all(
    reached.map(async (file) => ({ ...(await resolveNote(app, file, shallow)), related: true })),
  );
}

/**
 * Resolve one canvas file node, loading its body when it will be inlined.
 *
 * An excluded note is never read, so its text cannot reach the prompt even by
 * accident.
 */
async function resolveCanvasTarget(
  app: App,
  canvas: TFile,
  path: string,
  options: ResolveOptions,
): Promise<ResolvedTarget | null> {
  const resolved = resolveTarget(app, canvas, path, options);

  if (!resolved) return null;
  if (resolved.target.excluded || resolved.target.kind !== 'note') return resolved.target;
  if (options.embedDepth <= 0) return resolved.target;

  const visited = new Set([canvas.path, resolved.file.path]);
  const note = await resolveBody(app, resolved.file, options, 1, visited);

  return { ...resolved.target, note };
}

/**
 * Resolve a canvas into a note the renderer can handle.
 *
 * Canvas file nodes are treated as embeds, because that is what a canvas shows:
 * the note's content, in place. Targets are resolved up front so the body can
 * be assembled by a pure function.
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
  const targets = new Map<string, ResolvedTarget | null>();

  const paths = sections.flatMap((section) =>
    section.items.filter((item) => item.kind === 'file').map((item) => item.file),
  );

  for (const path of new Set(paths)) {
    targets.set(path, await resolveCanvasTarget(app, file, path, options));
  }

  return {
    title: file.basename,
    vaultPath: file.path,
    displayPath: displayPath(file.path, options.context, options.pathStyle),
    body: buildCanvasBody(sections, (path) => targets.get(path) ?? null),
  };
}
