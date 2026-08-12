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

/** Whether two ranges share any character. */
function overlaps(a: Edit, b: Edit): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Fuse overlapping deletions into their union.
 *
 * Two deletions that overlap both want their range gone, so the union is what
 * they jointly asked for. Picking a winner instead leaves the loser's tail in
 * the output — which is how an interleaved `%%comment%%` and `<% templater %>`
 * used to emit half a private note.
 */
function union(edits: readonly Edit[]): Edit[] {
  const ordered = edits.toSorted((a, b) => a.start - b.start || a.end - b.end);
  const merged: Edit[] = [];

  for (const edit of ordered) {
    const last = merged.at(-1);

    if (last && edit.start <= last.end) {
      last.end = Math.max(last.end, edit.end);
      continue;
    }

    merged.push({ ...edit });
  }

  return merged;
}

/** The parts of `edit` no range in `covers` already accounts for. */
function subtract(edit: Edit, covers: readonly Edit[]): Edit[] {
  let fragments: { start: number; end: number }[] = [{ start: edit.start, end: edit.end }];

  for (const cover of covers) {
    fragments = fragments.flatMap((fragment) => {
      if (cover.end <= fragment.start || cover.start >= fragment.end) return [fragment];

      const parts: { start: number; end: number }[] = [];

      if (fragment.start < cover.start) parts.push({ start: fragment.start, end: cover.start });
      if (cover.end < fragment.end) parts.push({ start: cover.end, end: fragment.end });

      return parts;
    });
  }

  return fragments.map((fragment) => ({ ...edit, ...fragment }));
}

/**
 * Decide which edits survive, by what each kind of edit is for.
 *
 * Three previous versions of this ranked edits against each other and each one
 * leaked, because ranking always discards a range somebody wanted removed. This
 * ranks nothing. Every kind gets what it asked for, in the only order that is
 * consistent:
 *
 * - **Deletions** always apply, unioned. Nothing outranks removing text.
 * - **Redactions** apply to whatever a deletion has not already taken. A
 *   redaction inside a deleted block is redundant, not defeated; one straddling
 *   the edge keeps the part still standing.
 * - **Rewrites** — a wikilink becoming a path — yield to both. A deletion
 *   removes their text, and a redaction must never be re-emitted through one.
 *
 * The failure this replaces: the old pre-pass judged containment against the
 * input set while the second phase judged survival against the kept set, so an
 * edit could be dropped for a container that then lost and vanished, leaving
 * nothing to remove the text. A fuzz run found that in 6% of random cases.
 */
function resolve(edits: readonly Edit[]): Edit[] {
  const deletions = union(edits.filter((edit) => edit.replacement === ''));
  const replacements = edits.filter((edit) => edit.replacement !== '');
  const redactions = replacements
    .filter((edit) => (edit.priority ?? 0) > 0)
    .flatMap((edit) => subtract(edit, deletions));

  const blocked = [...deletions, ...redactions];
  const kept = [...blocked];

  for (const rewrite of replacements
    .filter((edit) => (edit.priority ?? 0) === 0)
    .toSorted((a, b) => a.start - b.start || b.end - a.end)) {
    if (!kept.some((other) => overlaps(other, rewrite))) kept.push(rewrite);
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
  const ordered = resolve(edits).toSorted((a, b) => b.start - a.start);

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
 * An edit that straddles the window is clipped to what is visible rather than
 * dropped. The frontmatter edit always starts at offset 0, so dropping it meant
 * selecting from inside the block leaked the rest of it; a link to an excluded
 * note replaced with `[excluded]` was dropped the same way, printing the
 * filename that placeholder exists to hide.
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

    // Clipped, never dropped. Dropping a straddling edit leaves its text in
    // the slice — and for a link pointing at an excluded note, that text is the
    // filename `nameExcluded` exists to withhold. A clipped rewrite emits its
    // replacement over the visible fragment, which is a tidier outcome than
    // half a wikilink anyway.
    rebased.push({
      ...edit,
      start: Math.max(edit.start, start) - start,
      end: Math.min(edit.end, end) - start,
    });
  }

  return rebased;
}
