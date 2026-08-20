import { parseList } from './list-field.js';
import {
  PRESERVED_FRONTMATTER_KEYS,
  SKILL_CONTEXTS,
  SKILL_EFFORTS,
  SKILL_FRONTMATTER_KEYS,
  SKILL_SHELLS,
  type SkillContext,
  type SkillEffort,
  type SkillFrontmatter,
  type SkillShell,
} from './skill-fields.js';

/**
 * Reading and writing the skill frontmatter block.
 *
 * Recovery is per field, the same as `settings.ts`'s `parseSettings`: one
 * corrupt value falls back to unset rather than discarding every other field.
 * `hooks` and `openai` are nested shapes no form control models honestly, so
 * they are carried through verbatim rather than parsed.
 */

/** A frontmatter block split into the fields this panel edits and the ones it preserves untouched. */
export type ParsedSkillFrontmatter = {
  frontmatter: SkillFrontmatter;
  /** `hooks` / `openai`, present only when the source frontmatter had them. */
  preserved: Record<string, unknown>;
};

/** Assign a field only when a value actually recovered. */
function set<K extends keyof SkillFrontmatter>(
  frontmatter: SkillFrontmatter,
  key: K,
  value: SkillFrontmatter[K] | undefined,
): void {
  if (value !== undefined) frontmatter[key] = value;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function includesValue<T extends string>(allowed: readonly T[], value: string): value is T {
  return (allowed as readonly string[]).includes(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && includesValue(allowed, value) ? value : undefined;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Accept both the YAML list form and the space/comma separated string form Claude Code allows. */
function stringList(value: unknown): string[] | undefined {
  if (isStringArray(value)) return value.length > 0 ? value : undefined;
  if (typeof value === 'string') {
    const parsed = parseList(value.replaceAll(' ', ','));

    return parsed.length > 0 ? parsed : undefined;
  }

  return undefined;
}

function metadata(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;

  const result: Record<string, string> = {};
  let any = false;

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') continue;

    result[key] = entry;
    any = true;
  }

  return any ? result : undefined;
}

/**
 * Parse a raw frontmatter blob — whatever Obsidian's metadata cache reports —
 * into the fields this panel edits, plus anything preserved untouched.
 *
 * @param source - `metadataCache.getFileCache(file)?.frontmatter`, or any value.
 * @returns Recovered fields. Never throws.
 */
export function parseSkillFrontmatter(source: unknown): ParsedSkillFrontmatter {
  const record: Record<string, unknown> = {
    ...(typeof source === 'object' && source !== null ? source : {}),
  };

  // `exactOptionalPropertyTypes` forbids assigning `undefined` to an optional
  // property, so each field is set only when a value actually recovered —
  // never assigned `undefined` outright.
  const frontmatter: SkillFrontmatter = {};

  set(frontmatter, 'name', text(record['name']));
  set(frontmatter, 'description', text(record['description']));
  set(frontmatter, 'license', text(record['license']));
  set(frontmatter, 'compatibility', text(record['compatibility']));
  set(frontmatter, 'metadata', metadata(record['metadata']));
  set(frontmatter, 'allowed-tools', stringList(record['allowed-tools']));
  set(frontmatter, 'when_to_use', text(record['when_to_use']));
  set(frontmatter, 'argument-hint', text(record['argument-hint']));
  set(frontmatter, 'arguments', stringList(record['arguments']));
  set(frontmatter, 'disable-model-invocation', bool(record['disable-model-invocation']));
  set(frontmatter, 'user-invocable', bool(record['user-invocable']));
  set(frontmatter, 'disallowed-tools', stringList(record['disallowed-tools']));
  set(frontmatter, 'model', text(record['model']));
  set(frontmatter, 'effort', oneOf<SkillEffort>(record['effort'], SKILL_EFFORTS));
  set(frontmatter, 'context', oneOf<SkillContext>(record['context'], SKILL_CONTEXTS));
  set(frontmatter, 'agent', text(record['agent']));
  set(frontmatter, 'background', bool(record['background']));
  set(frontmatter, 'paths', stringList(record['paths']));
  set(frontmatter, 'shell', oneOf<SkillShell>(record['shell'], SKILL_SHELLS));

  const preserved: Record<string, unknown> = {};

  for (const key of PRESERVED_FRONTMATTER_KEYS) {
    if (record[key] !== undefined) preserved[key] = record[key];
  }

  return { frontmatter, preserved };
}

/**
 * Project parsed frontmatter onto a plain record holding only the fields
 * that are actually set, plus anything preserved.
 *
 * This is the one projection both write paths use: a note write sets exactly
 * these keys on the existing frontmatter object and deletes the rest,
 * leaving every Obsidian housekeeping key (`tags`, `aliases`, `skill`
 * itself, …) untouched; a `SKILL.md` export or copy emits exactly this
 * record and nothing else, so none of those housekeeping keys — and no
 * empty field — ever reaches the exported file.
 */
export function toSkillRecord(parsed: ParsedSkillFrontmatter): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const key of SKILL_FRONTMATTER_KEYS) {
    const value = parsed.frontmatter[key];

    if (value !== undefined) result[key] = value;
  }

  for (const key of PRESERVED_FRONTMATTER_KEYS) {
    if (parsed.preserved[key] !== undefined) result[key] = parsed.preserved[key];
  }

  return result;
}
