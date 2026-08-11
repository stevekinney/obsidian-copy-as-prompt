import { rebaseEdits, type Edit } from './edits.js';
import { reference } from './paths.js';

/**
 * The resolved-link model.
 *
 * Obsidian's metadata cache gives us links, embeds, and frontmatter links with
 * exact offsets. The impure layer (`src/vault.ts`) turns those into the types
 * below — resolving each link against the vault, deciding what kind of file it
 * points at, and loading content for embeds it intends to inline. Everything
 * downstream of that is pure and tested here.
 */

/** What a reference points at, which decides how it renders. */
export type TargetKind = 'note' | 'image' | 'attachment';

/** A link target that exists in the vault. */
export type ResolvedTarget = {
  /** Vault-relative path, e.g. `Work/Design.md`. */
  vaultPath: string;
  /** The path as it should appear in the prompt, e.g. `~/Vaults/Work/Design.md`. */
  displayPath: string;
  /** The real absolute path, used when putting image files on the clipboard. */
  absolutePath: string;
  /** Basename without extension. */
  title: string;
  kind: TargetKind;
  /** True when exclusion rules withhold this note. */
  excluded?: boolean | undefined;
  /**
   * The target's body, present only when the impure layer loaded it for
   * inlining. Absent for links that aren't embeds, for targets past the
   * configured depth, and for embeds that would close a cycle.
   */
  note?: NoteBody | undefined;
};

/** A note's text together with everything known about it from the cache. */
export type NoteBody = {
  content: string;
  references: NoteReference[];
  /**
   * Edits derived from Obsidian's metadata cache rather than from text
   * matching: frontmatter removal and `#tag` removal. The cache knows a `#tag`
   * from a `#heading` and from a `#` inside a code span, which is exactly the
   * distinction a regex gets wrong.
   */
  cacheEdits: Edit[];
};

/** A single link or embed, located in its source note. */
export type NoteReference = {
  /** Offset of the reference in its source note. */
  start: number;
  /** End offset, exclusive. */
  end: number;
  /** The reference exactly as written, e.g. `[[Design#Limits|the contract]]`. */
  original: string;
  /** A `#heading` or `#^block` anchor, without the leading `#`. */
  anchor?: string | undefined;
  /** True for `![[…]]` transclusions, false for plain `[[…]]` links. */
  embed: boolean;
  /** Display text, when the link had an alias. */
  displayText?: string | undefined;
  /** The target, or `null` when the link points at nothing. */
  target: ResolvedTarget | null;
};

/**
 * What stands in for a note the exclusion rules withheld.
 *
 * Naming it is off by default: a filename like `Divorce lawyer.md` is itself
 * the sensitive part, so a prompt that names what it refused to include can
 * leak the very thing the rule existed to protect. Knowing *which* note was
 * held back is genuinely useful while you are tuning rules, though, so it is a
 * setting rather than a verdict.
 */
export function excludedLabel(vaultPath: string, named: boolean): string {
  return named ? `[excluded: ${vaultPath}]` : '[excluded]';
}

/**
 * Render an anchor as a parenthetical hint.
 *
 * A path alone throws away the part of `[[Design#Rate limits]]` that said which
 * bit of Design you meant. Claude Code won't jump to the heading, but the model
 * reads the hint and looks in the right place.
 */
function anchorHint(anchor: string | undefined): string {
  if (!anchor) return '';
  if (anchor.startsWith('^')) return ` (see block ${anchor})`;

  return ` (see "${anchor}")`;
}

/**
 * Render a reference as an `@` path.
 *
 * Unresolved links keep their original `[[…]]` text on purpose: emitting a path
 * for a note that doesn't exist sends the model chasing a missing file, whereas
 * a bare wikilink reads unmistakably as "this isn't a real file yet".
 */
export function renderAsPath(item: NoteReference, nameExcluded = false): string {
  if (!item.target) return item.original;
  if (item.target.excluded) return excludedLabel(item.target.vaultPath, nameExcluded);

  return `${reference(item.target.displayPath)}${anchorHint(item.anchor)}`;
}

/**
 * Render a reference as plain text, for a prompt that has to stand alone.
 *
 * Images become a named placeholder so you can tell what to attach and where it
 * belonged. Non-embed links collapse to their display text.
 */
export function renderAsText(item: NoteReference, nameExcluded = false): string {
  if (!item.target) return item.original;
  if (item.target.excluded) return excludedLabel(item.target.vaultPath, nameExcluded);
  if (item.target.kind === 'image') return `[image: ${basename(item.target.vaultPath)}]`;
  if (item.target.kind === 'attachment') {
    return `[attachment: ${basename(item.target.vaultPath)}]`;
  }

  return item.displayText ?? item.target.title;
}

/** The final path segment, e.g. `attachments/diagram.png` → `diagram.png`. */
export function basename(vaultPath: string): string {
  return vaultPath.slice(vaultPath.lastIndexOf('/') + 1);
}

/** Turn a reference into the edit that replaces it. */
export function editFor(item: NoteReference, replacement: string): Edit {
  return { start: item.start, end: item.end, replacement };
}

/**
 * Narrow a body to a character range, keeping only whole references.
 *
 * The "copy selection" command works on a slice of the note, but everything the
 * metadata cache reports is positioned against the whole file. A link the user
 * only half-selected is dropped rather than half-rewritten, which would emit
 * broken wikilink syntax.
 *
 * @param body - The full note body.
 * @param start - Selection start offset.
 * @param end - Selection end offset, exclusive.
 * @returns A body whose offsets are relative to the selection.
 */
export function sliceBody(body: NoteBody, start: number, end: number): NoteBody {
  return {
    content: body.content.slice(start, end),
    references: body.references
      .filter((item) => item.start >= start && item.end <= end)
      .map((item) => ({ ...item, start: item.start - start, end: item.end - start })),
    cacheEdits: rebaseEdits(body.cacheEdits, start, end),
  };
}
