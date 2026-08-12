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

/** Whether `outer` completely covers `inner`. */
function encloses(outer: Edit, inner: Edit): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

/**
 * Resolve overlapping edits.
 *
 * Two rules, and the order between them is the whole point.
 *
 * Containment first: an edit fully inside another is dropped, whatever its
 * priority. The container is already deleting that text, so keeping the inner
 * one instead would cancel the removal — a redaction matching a key inside a
 * frontmatter block would stop the block being stripped and emit the salary
 * next to it. Failing open on the container is far worse than the overlap this
 * priority exists for.
 *
 * Priority second, and only for partial overlaps: there nothing else deletes
 * the text, so a redaction that lost would leave behind exactly what it was
 * meant to remove.
 */
function withoutOverlaps(edits: readonly Edit[]): Edit[] {
  const outermost = edits.filter(
    (edit, index) =>
      !edits.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          encloses(other, edit) &&
          // Identical ranges enclose each other; keep whichever came first.
          (!encloses(edit, other) || otherIndex < index),
      ),
  );

  const sorted = outermost.toSorted(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.start - b.start || b.end - a.end,
  );
  const kept: Edit[] = [];

  for (const edit of sorted) {
    // Priority ordering breaks left-to-right arrival, so every kept range has
    // to be checked rather than just the last.
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
    // A clipped deletion still deletes what is visible, and a clipped redaction
    // still redacts it. A clipped link rewrite would be broken syntax.
    const clippable = edit.replacement === '' || (edit.priority ?? 0) > 0;

    if (!whollyInside && !clippable) continue;

    rebased.push({
      ...edit,
      start: Math.max(edit.start, start) - start,
      end: Math.min(edit.end, end) - start,
    });
  }

  return rebased;
}
