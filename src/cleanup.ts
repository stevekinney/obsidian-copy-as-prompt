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

// `%%…%%`. Obsidian's comment syntax, inline or spanning lines. These are
// private by convention — the whole point is that they never render — so
// leaking one into a prompt is the kind of thing you notice after sending.
const COMMENT = /%%[\s\S]*?%%/g;

// ```dataview / ```dataviewjs fenced blocks. They paste as raw query source,
// which a model will earnestly try to read as content.
const DATAVIEW_BLOCK = /^[ \t]*```dataview(?:js)?\b[\s\S]*?^[ \t]*```[ \t]*$/gm;

// Inline dataview: `= this.file.name` and `$= dv.current()`.
const DATAVIEW_INLINE = /`[$]?=[^`\n]*`/g;

// Templater: `<% … %>` and `<%* … %>`.
const TEMPLATER = /<%[\s\S]*?%>/g;

function editsFor(source: string, pattern: RegExp, trailingNewline: boolean): Edit[] {
  const edits: Edit[] = [];

  for (const match of source.matchAll(pattern)) {
    const start = match.index;
    let end = start + match[0].length;

    // Swallow the newline a removed block would otherwise leave behind.
    if (trailingNewline && source[end] === '\n') end += 1;

    edits.push({ start, end, replacement: '' });
  }

  return edits;
}

/** Edits removing every `%%Obsidian comment%%`. */
export function commentEdits(source: string): Edit[] {
  return editsFor(source, COMMENT, false);
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
  return source
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
