/**
 * Settings fields that hold a list.
 *
 * Several settings are "a list of things" stored as one comma or newline
 * separated string, because that is what a text field can hold. These helpers
 * are the only place that format is interpreted, so the UI can offer add and
 * remove affordances without every caller re-deriving the parsing.
 */

/** Split a comma or newline separated field into entries. */
export function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Render entries back into the stored form. */
export function formatList(entries: readonly string[]): string {
  return entries.join(', ');
}

/**
 * Add an entry, ignoring duplicates and preserving order.
 *
 * @param value - The current field.
 * @param entry - The entry to add. Whitespace and a leading `--` are trimmed.
 * @returns The updated field.
 */
export function withEntry(value: string, entry: string): string {
  const clean = entry.trim().replace(/^-+/, '');

  if (!clean) return value;

  const entries = parseList(value);

  if (entries.includes(clean)) return value;

  return formatList([...entries, clean]);
}

/**
 * Remove an entry.
 *
 * @param value - The current field.
 * @param entry - The entry to remove.
 * @returns The updated field.
 */
export function withoutEntry(value: string, entry: string): string {
  return formatList(parseList(value).filter((existing) => existing !== entry));
}
