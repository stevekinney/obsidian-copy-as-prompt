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
