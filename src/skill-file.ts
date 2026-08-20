/**
 * A minimal YAML emitter for the skill frontmatter block.
 *
 * `stringifyYaml` lives in the `obsidian` package, which ships only type
 * declarations — there is no runtime implementation outside the app, so it
 * cannot be used from a module this repo can unit test. This covers exactly
 * the shapes {@link toSkillRecord} produces: strings, booleans, string
 * lists, and one or two levels of plain-object nesting for `metadata` and
 * the preserved `hooks` / `openai` blocks. It is not a general-purpose YAML
 * writer.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether a string needs quoting to round-trip as YAML. */
function needsQuoting(value: string): boolean {
  if (value.length === 0) return true;
  if (value !== value.trim()) return true;
  if (value.includes('\n')) return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) return true;
  if (/: |:$/.test(value)) return true;
  if (/^(true|false|null|~|yes|no|on|off)$/i.test(value)) return true;
  if (/^-?\d+(\.\d+)?$/.test(value)) return true;
  if (/["\\]/.test(value)) return true;

  return false;
}

function scalar(value: string): string {
  if (!needsQuoting(value)) return value;

  const escaped = value
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('"', String.raw`\"`)
    .replaceAll('\n', String.raw`\n`);

  return `"${escaped}"`;
}

function emitValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return scalar(value);

  // Preserved frontmatter (`hooks`, `openai`) comes from parsed YAML, so its
  // scalars are always one of the above. Anything else is a shape this
  // emitter was never meant to see.
  throw new Error(`Cannot emit a ${typeof value} as YAML`);
}

function emitEntries(record: Record<string, unknown>, indent: number): string {
  return Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => emitEntry(key, value, indent))
    .join('');
}

function emitList(items: readonly unknown[], indent: number): string {
  const pad = '  '.repeat(indent);

  return items
    .map((item) => {
      if (isPlainObject(item)) {
        const nested = emitEntries(item, indent + 1).trimStart();

        return `${pad}- ${nested}`;
      }

      return `${pad}- ${emitValue(item)}\n`;
    })
    .join('');
}

function emitEntry(key: string, value: unknown, indent: number): string {
  const pad = '  '.repeat(indent);
  const keyText = scalar(key);

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}${keyText}: []\n`;

    return `${pad}${keyText}:\n${emitList(value, indent + 1)}`;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);

    if (entries.length === 0) return `${pad}${keyText}: {}\n`;

    return `${pad}${keyText}:\n${emitEntries(value, indent + 1)}`;
  }

  return `${pad}${keyText}: ${emitValue(value)}\n`;
}

/** Emit a plain record — string, boolean, number, array, and nested-object values only — as block-style YAML. */
export function serializeYaml(record: Record<string, unknown>): string {
  return emitEntries(record, 0);
}

/** Assemble a `SKILL.md`: a fenced frontmatter block, then the body verbatim. */
export function serializeSkillFile(record: Record<string, unknown>, body: string): string {
  return `---\n${serializeYaml(record)}---\n${body}`;
}
