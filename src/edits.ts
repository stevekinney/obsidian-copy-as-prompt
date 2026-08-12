/**
 * Offset-based text rewriting.
 *
 * Every transformation in this plugin — resolving a wikilink to a path,
 * removing a comment, dropping a tag — is expressed as a range of the original
 * note plus what should replace it. Collecting them all and applying them in a
 * single descending pass means no transformation ever sees text another one has
 * already moved, which is where sequential regex passes go wrong.
 *
 * The offsets come from Obsidian's metadata cache, which does not index links
 * inside fenced code blocks. A `[[Wikilink]]` in a code sample is therefore
 * left alone for free — something a regex over the raw text cannot do.
 */

/** A replacement of `[start, end)` in the source with `replacement`. */
export type Edit = {
  start: number;
  end: number;
  replacement: string;
  /**
   * Which edit survives when two overlap. Higher wins; default 0.
   *
   * This exists for redaction. Overlap resolution is otherwise outermost-wins,
   * and a redaction that happened to straddle a link or the frontmatter block
   * was the one dropped — leaving the text it was meant to remove in the
   * output. A control that fails open on an overlap is not a control.
   */
  priority?: number | undefined;
};

/**
 * Drop edits that overlap one already kept.
 *
 * Ranges nest legitimately — a tag inside a comment, a link inside a callout
 * that is being removed — and the outer edit is the one that should win, since
 * it deletes the inner one's text anyway. Sorting by start ascending and then
 * by length descending puts the outer edit first, so keeping the first of any
 * overlapping group is the right rule.
 *
 * Priority comes first, so a redaction beats whatever it overlaps.
 */
function withoutOverlaps(edits: readonly Edit[]): Edit[] {
  const sorted = edits.toSorted(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.start - b.start || b.end - a.end,
  );
  const kept: Edit[] = [];

  for (const edit of sorted) {
    // Priority ordering means this can no longer assume left-to-right arrival,
    // so every kept range has to be checked rather than just the last one.
    const clashes = kept.some((other) => edit.start < other.end && other.start < edit.end);

    if (!clashes) kept.push(edit);
  }

  return kept;
}

/**
 * Apply edits to a string.
 *
 * @param source - The original text. Offsets are relative to this.
 * @param edits - Edits in any order. Overlapping edits resolve outermost-wins.
 * @returns The rewritten text.
 */
export function applyEdits(source: string, edits: readonly Edit[]): string {
  const ordered = withoutOverlaps(edits).toSorted((a, b) => b.start - a.start);

  let result = source;

  for (const edit of ordered) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  }

  return result;
}

/**
 * Keep only the edits fully inside `[start, end)`, rebased to that window.
 *
 * The "copy selection" command hands us a slice of the note, but the metadata
 * cache's offsets are relative to the whole file.
 *
 * An edit that straddles the window is handled by what it does. A replacement —
 * a link becoming a path — is dropped, because half of one is broken syntax. A
 * deletion is clipped to what is visible and still applied: the frontmatter
 * edit always starts at offset 0, so dropping it meant that selecting from
 * inside the frontmatter block leaked the rest of it into the prompt.
 *
 * @param edits - Edits with offsets relative to the full note.
 * @param start - Selection start offset in the full note.
 * @param end - Selection end offset in the full note.
 * @returns Edits with offsets relative to the selection.
 */
export function rebaseEdits(edits: readonly Edit[], start: number, end: number): Edit[] {
  const rebased: Edit[] = [];

  for (const edit of edits) {
    if (edit.end <= start || edit.start >= end) continue;

    const whollyInside = edit.start >= start && edit.end <= end;

    if (!whollyInside && edit.replacement !== '') continue;

    rebased.push({
      ...edit,
      start: Math.max(edit.start, start) - start,
      end: Math.min(edit.end, end) - start,
    });
  }

  return rebased;
}
