import type { Edit } from './edits.js';

/**
 * Keeping notes out of prompts.
 *
 * Link traversal reaches notes you did not pick by hand — two hops from a work
 * note can land in a journal — so the plugin needs a floor that holds no matter
 * how the context was assembled. These rules apply everywhere content is
 * gathered: traversal, embeds, folders, canvases, and direct selection alike.
 *
 * Matching deliberately errs toward excluding. Folder and tag comparisons are
 * case-insensitive, because a rule that silently fails to match `personal/` when
 * you typed `Personal/` is worse than one that occasionally excludes too much.
 */

/** What must never end up in a prompt. */
export type ExclusionRules = {
  /** Tag names, with or without the leading `#`. Matches nested tags too. */
  tags: string[];
  /** Vault-relative folder paths. */
  folders: string[];
  /** Regular expression sources, applied to note text. */
  patterns: string[];
};

/** Just enough about a note to decide whether it is allowed. */
export type NoteIdentity = {
  path: string;
  /** Tags from the metadata cache, typically `#work`, `#private/health`. */
  tags: string[];
};

/** Rules that exclude nothing. */
export const NO_EXCLUSIONS: ExclusionRules = { tags: [], folders: [], patterns: [] };

function normalizeTag(tag: string): string {
  // The trailing slash matters: `#private/` would otherwise become `private/`
  // and match nothing, while the adjacent Folders field tolerates exactly that
  // typo. Two neighbouring fields disagreeing about it fails open.
  return tag.replace(/^#/, '').replace(/\/+$/, '').toLowerCase();
}

/**
 * Whether `tag` is `rule` or lives beneath it.
 *
 * `#private` has to exclude `#private/health` as well, or nesting becomes a way
 * to accidentally defeat the rule.
 */
function tagMatches(tag: string, rule: string): boolean {
  const value = normalizeTag(tag);
  const target = normalizeTag(rule);

  return value === target || value.startsWith(`${target}/`);
}

/**
 * Whether a note sits under a folder named by the rule, at any depth.
 *
 * Anchoring at the vault root would mean `Journal` protects `Journal/` and not
 * `Work/Journal/`, while the settings field asks for bare folder names and
 * promises they hold "however they were reached". Matching whole segments keeps
 * `Personal` from catching `Personal-projects`.
 */
function folderMatches(path: string, rule: string): boolean {
  const folder = rule.replace(/^[./]+|\/+$/g, '').toLowerCase();

  if (!folder) return false;

  return `/${path.toLowerCase()}`.includes(`/${folder}/`);
}

/**
 * Whether a note is excluded by any rule.
 *
 * @param note - The note's path and tags.
 * @param rules - The configured exclusions.
 * @returns True when the note must not appear in a prompt.
 */
export function isExcluded(note: NoteIdentity, rules: ExclusionRules): boolean {
  if (rules.folders.some((folder) => folderMatches(note.path, folder))) return true;

  return rules.tags.some((rule) => note.tags.some((tag) => tagMatches(tag, rule)));
}

/**
 * Edits that blank out every match of the configured patterns.
 *
 * An invalid regular expression is skipped rather than thrown: a typo in a
 * settings field should not break copying, and the remaining patterns still
 * apply.
 *
 * Overlapping matches are fused by `applyEdits` itself, so two patterns
 * contending for the same text produce one marker rather than a fragment of
 * one spliced into the other.
 *
 * @param source - The note text.
 * @param patterns - Regular expression sources.
 * @returns Edits replacing each match with a redaction marker.
 */
export function redactionEdits(source: string, patterns: readonly string[]): Edit[] {
  const edits: Edit[] = [];

  for (const pattern of patterns) {
    let expression: RegExp;

    try {
      expression = new RegExp(pattern, 'g');
    } catch {
      continue;
    }

    for (const match of source.matchAll(expression)) {
      // A zero-width match would loop forever and edit nothing.
      if (match[0].length === 0) continue;

      edits.push({
        start: match.index,
        end: match.index + match[0].length,
        replacement: '[redacted]',
        // Outranks link rewriting and frontmatter removal: a redaction that
        // loses an overlap leaves behind exactly the text it existed to remove.
        priority: 1,
      });
    }
  }

  return edits;
}
