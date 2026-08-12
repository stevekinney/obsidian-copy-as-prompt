import type { Edit } from './edits.js';

/**
 * Removing the parts of a note that shouldn't reach a model.
 *
 * Each function returns {@link Edit}s against the original text rather than a
 * rewritten string, so these compose with link resolution in one pass. Tag
 * removal is not here: tag offsets come from Obsidian's metadata cache, which
 * knows the difference between a `#tag` and a `#heading` far better than a
 * regex would.
 */

// `%%…%%`. Obsidian's comment syntax. These are private by convention — the
// whole point is that they never render — so leaking one into a prompt is the
// kind of thing you notice after sending.
//
// Deliberately two narrow patterns rather than one permissive `%%[\s\S]*?%%`.
// That form pairs any stray `%%` with the *opening* delimiter of a real comment
// later in the note, which deletes everything in between and then emits the
// comment's text — the exact inversion of the setting. `printf("100%%\n")` is
// enough to trigger it. An inline comment must open and close on one line; a
// block comment must have its delimiters alone on their own lines.
const COMMENT_INLINE = /%%[^\n]*?%%/g;
const COMMENT_BLOCK = /^[ \t]*%%[ \t]*\r?\n[\s\S]*?^[ \t]*%%[ \t]*$/gm;

// ```dataview / ```dataviewjs fenced blocks. They paste as raw query source,
// which a model will earnestly try to read as content.
const DATAVIEW_BLOCK = /^[ \t]*```dataview(?:js)?\b[\s\S]*?^[ \t]*```[ \t]*$/gm;

// Inline dataview: `= this.file.name` and `$= dv.current()`.
//
// The whitespace after `=` is doing real work. Without it this matched any code
// span starting with `=` and silently deleted `` `=>` ``, `` `=SUM(A1:A9)` ``,
// and `` `=== ` ``. Missing a space-less `` `=this.file` `` is a far better
// failure than eating someone's spreadsheet formula.
const DATAVIEW_INLINE = /`[$]?=\s[^`\n]*`/g;

// Templater: `<% … %>` and `<%* … %>`.
const TEMPLATER = /<%[\s\S]*?%>/g;

function editsFor(source: string, pattern: RegExp, trailingNewline: boolean): Edit[] {
  const edits: Edit[] = [];

  for (const match of source.matchAll(pattern)) {
    const start = match.index;
    let end = start + match[0].length;

    // Swallow the newline a removed block would otherwise leave behind, taking
    // both halves of a CRLF.
    if (trailingNewline) {
      if (source.startsWith('\r\n', end)) end += 2;
      else if (source[end] === '\n') end += 1;
    }

    edits.push({ start, end, replacement: '' });
  }

  return edits;
}

/** Edits removing every `%%Obsidian comment%%`. */
export function commentEdits(source: string): Edit[] {
  return [...editsFor(source, COMMENT_BLOCK, true), ...editsFor(source, COMMENT_INLINE, false)];
}

/** Edits removing Dataview blocks, inline Dataview, and Templater expressions. */
export function dynamicBlockEdits(source: string): Edit[] {
  return [
    ...editsFor(source, DATAVIEW_BLOCK, true),
    ...editsFor(source, DATAVIEW_INLINE, false),
    ...editsFor(source, TEMPLATER, false),
  ];
}

/**
 * Tidy up the whitespace that removals leave behind.
 *
 * Deleting a trailing `#tag` leaves a line ending in spaces; deleting a block
 * leaves a run of blank lines. Neither is wrong so much as noisy, and noise in
 * a prompt is tokens.
 *
 * @param source - Text that has already had its edits applied.
 * @returns The text with trailing spaces removed and blank runs collapsed.
 */
export function tidy(source: string): string {
  return (
    source
      .replace(/[ \t]+$/gm, '')
      // Removing a mid-sentence tag leaves a double space. Markdown collapses
      // runs of spaces anyway, and this is what lets tag removal keep to its own
      // exact range instead of reaching backwards into another edit's territory.
      .replace(/([^\s])[ \t]{2,}(?=\S)/g, '$1 ')
      .replace(/(?:\r?\n){3,}/g, '\n\n')
      .trim()
  );
}
