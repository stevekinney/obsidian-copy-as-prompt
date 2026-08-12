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

// `%%…%%`. Obsidian's comment syntax, which is a *toggle*: each delimiter
// flips visibility, so comments are the odd-numbered spans and text may sit on
// the same line as either delimiter. This pattern reproduces that pairing.
//
// It over-deletes when a note contains a stray `%%` — `printf("100%%")` pairs
// with the next comment's opening delimiter and takes the text between with it.
// That is the deliberate direction to fail in. Narrower rules that only match
// same-line or delimiters-alone-on-a-line comments leak every other legal form
// straight into the prompt, and the entire point of the setting is that these
// never leave the vault. Losing a paragraph is recoverable; leaking one is not.
const COMMENT = /%%[\s\S]*?%%/g;

// ```dataview / ```dataviewjs fenced blocks. They paste as raw query source,
// which a model will earnestly try to read as content.
const DATAVIEW_BLOCK = /^[ \t]*```dataview(?:js)?\b[\s\S]*?^[ \t]*```[ \t]*$/gm;

// Inline dataview: `= this.file.name` and `$= dv.current()`.
//
// What follows `=` is doing real work. Matching any code span starting with
// `=` silently deleted `` `=>` ``, `` `=SUM(A1:A9)` ``, and `` `=== ` ``.
// Requiring whitespace fixed that but missed `` `=this.file.name` ``, which is
// Dataview's own documented form, so the two known prefixes are allowed too.
const DATAVIEW_INLINE = /`[$]?=(?:\s|this\.|dv\.)[^`\n]*`/g;

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
  return (
    source
      .replace(/[ \t]+$/gm, '')
      // No run-of-spaces collapse here. It looks harmless — Markdown folds
      // whitespace in prose — but this runs over the whole rendered body, and
      // the places multiple spaces are load-bearing are exactly code fences,
      // diffs, and string literals. Tag removal takes its own trailing space
      // instead, which needs no global pass.
      .replace(/(?:\r?\n){3,}/g, '\n\n')
      .trim()
  );
}
