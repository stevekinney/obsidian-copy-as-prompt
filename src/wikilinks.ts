import type { NoteReference, ResolvedTarget } from './references.js';

/**
 * Finding wikilinks in text without a metadata cache.
 *
 * Obsidian's cache is the right source for links: it carries exact offsets and
 * it does not index links inside code fences, so a `[[Wikilink]]` in a code
 * sample is left alone for free. This exists for the two places no cache is
 * available — canvas prose, which is not a note, and a note whose cached
 * offsets no longer describe its text.
 *
 * A regex cannot tell a code fence from prose, so it over-resolves there. That
 * is the safe direction: the alternative is emitting a link untouched, and an
 * untouched link to an excluded note prints the filename that the `[excluded]`
 * placeholder exists to withhold.
 */
const WIKILINK = /!?\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|[^\]]*)?\]\]/g;

/** Resolves a link path against the vault. */
export type TargetResolver = (linkpath: string) => ResolvedTarget | null;

/**
 * Scan text for wikilinks.
 *
 * @param text - The text to scan.
 * @param offset - Added to each position, for text embedded in a larger body.
 * @param resolve - Resolves each link path.
 * @returns References, positioned against the containing body.
 */
export function scanWikilinks(
  text: string,
  offset: number,
  resolve: TargetResolver,
): NoteReference[] {
  return [...text.matchAll(WIKILINK)].map((match) => ({
    start: offset + match.index,
    end: offset + match.index + match[0].length,
    original: match[0],
    anchor: match[2]?.trim(),
    target: resolve((match[1] ?? '').trim()),
  }));
}
