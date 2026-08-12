/**
 * Settings fields that hold a list.
 *
 * Several settings are "a list of things" stored as one comma or newline
 * separated string, because that is what a text field can hold. This is the
 * only place that format is interpreted.
 */

/** Split a comma or newline separated field into entries. */
export function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Split a field where entries may legitimately contain commas.
 *
 * Regular expressions do: `\\d{3,5}` is one pattern, and splitting it on the
 * comma yields two invalid fragments that compile to nothing and silently
 * redact nothing. Newlines are the only safe separator for that field.
 */
export function parseLines(value: string): string[] {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
