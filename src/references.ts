import { rebaseEdits, type Edit } from './edits.js';
import { reference } from './paths.js';

/**
 * The resolved-link model.
 *
 * Obsidian's metadata cache gives us links and embeds with exact offsets. The
 * impure layer (`src/vault.ts`) turns those into the types below, resolving
 * each against the vault. Everything downstream of that is pure and tested
 * here.
 */

/** A link target that exists in the vault. */
export type ResolvedTarget = {
  /** Vault-relative path, e.g. `Work/Design.md`. */
  vaultPath: string;
  /** The path as it should appear in the prompt, e.g. `~/Vaults/Work/Design.md`. */
  displayPath: string;
  /** True when exclusion rules withhold this note. */
  excluded?: boolean | undefined;
};

/** A note's text together with everything known about it from the cache. */
export type NoteBody = {
  content: string;
  references: NoteReference[];
  /**
   * Edits derived from Obsidian's metadata cache rather than from text
   * matching: frontmatter removal, `#tag` removal, and redaction. The cache
   * knows a `#tag` from a `#heading` and from a `#` inside a code span, which
   * is exactly the distinction a regex gets wrong.
   */
  cacheEdits: Edit[];
  /**
   * True when the cache could not be reconciled with the text, so some link may
   * be unaccounted for. Only matters when exclusion rules are configured: an
   * unaccounted link could be one pointing at a note that must be withheld.
   */
  uncertain?: boolean | undefined;
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
  /** The target, or `null` when the link points at nothing. */
  target: ResolvedTarget | null;
};

/**
 * What stands in for a note the exclusion rules withheld.
 *
 * Naming it is off by default: a filename like `Divorce lawyer.md` is itself
 * the sensitive part, so a prompt that names what it refused to include can
 * leak the very thing the rule existed to protect. Knowing *which* note was
 * held back is useful while tuning rules, so it is a setting rather than a
 * verdict.
 */
export function excludedLabel(vaultPath: string, named: boolean): string {
  return named ? `[excluded: ${vaultPath}]` : '[excluded]';
}

/**
 * Render an anchor as a parenthetical hint.
 *
 * A path alone throws away the part of `[[Design#Rate limits]]` that said which
 * bit of Design you meant. The agent won't jump to the heading, but the model
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

/** Turn a reference into the edit that replaces it. */
export function editFor(item: NoteReference, replacement: string): Edit {
  return { start: item.start, end: item.end, replacement };
}

/**
 * Narrow a body to a character range, keeping only whole references.
 *
 * The "copy selection" command works on a slice of the note, but everything the
 * metadata cache reports is positioned against the whole file.
 *
 * A half-selected link is clipped, not dropped. Dropping it leaves the raw
 * `[[wikilink]]` text in the slice, and when that link points at an excluded
 * note the text is the filename `[excluded]` exists to withhold — so a partial
 * selection walked straight past the placeholder.
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
      .filter((item) => item.end > start && item.start < end)
      // A clipped reference keeps its full `original`, and an unresolved one
      // renders as exactly that — so clipping it emitted note text from outside
      // the selection, sometimes from before its start. Resolved and excluded
      // targets render to something self-contained and clip safely.
      .filter((item) => item.target !== null || (item.start >= start && item.end <= end))
      .map((item) => ({
        ...item,
        start: Math.max(item.start, start) - start,
        end: Math.min(item.end, end) - start,
      })),
    cacheEdits: rebaseEdits(body.cacheEdits, start, end),
  };
}
