/**
 * Pure prompt-building logic.
 *
 * Nothing in this module imports `obsidian`, which means it runs — and is
 * tested — outside the app. Keep it that way: anything that needs the Vault,
 * the workspace, or the DOM belongs in `main.ts` or the settings tab.
 */

/** A note reduced to the fields a prompt template can reference. */
export type NoteSource = {
  /** The note's title, without the `.md` extension. */
  title: string;
  /** The note's vault-relative path. */
  path: string;
  /** The note's raw Markdown. */
  content: string;
};

/** The subset of settings that affects prompt output. */
export type PromptOptions = {
  template: string;
  stripFrontmatter: boolean;
  fenceContent: boolean;
};

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const PLACEHOLDER = /\{\{(title|path|content)\}\}/g;
const FENCE_RUN = /^[ \t]*(`{3,})/gm;
const MINIMUM_FENCE = 3;

/**
 * Remove a leading YAML frontmatter block.
 *
 * Only a block at the very start of the note counts — a `---` further down is
 * a horizontal rule, not frontmatter.
 *
 * @param source - The raw Markdown.
 * @returns The Markdown with any leading frontmatter block removed.
 */
export function stripFrontmatter(source: string): string {
  return source.replace(FRONTMATTER, '');
}

/**
 * Wrap Markdown in a fenced code block that the content cannot break out of.
 *
 * A note containing its own triple-backtick fence would terminate a naive
 * wrapper early, leaving the model with malformed input. The fence grows to
 * one backtick longer than the longest run already in the content.
 *
 * @param content - The Markdown to wrap.
 * @param info - The fence's info string. Defaults to `markdown`.
 * @returns The content inside a Markdown code fence.
 */
export function fence(content: string, info = 'markdown'): string {
  let longest = 0;

  for (const match of content.matchAll(FENCE_RUN)) {
    longest = Math.max(longest, match[1]?.length ?? 0);
  }

  const ticks = '`'.repeat(Math.max(MINIMUM_FENCE, longest + 1));

  return `${ticks}${info}\n${content}\n${ticks}`;
}

/**
 * Render a note into a prompt using the configured template.
 *
 * Substitution is single-pass, so a note whose body happens to contain
 * `{{title}}` is left alone rather than being expanded a second time.
 *
 * @param note - The note to render.
 * @param options - How to transform the note before substitution.
 * @returns The rendered prompt.
 */
export function buildPrompt(note: NoteSource, options: PromptOptions): string {
  const stripped = options.stripFrontmatter ? stripFrontmatter(note.content) : note.content;
  const content = options.fenceContent ? fence(stripped.trim()) : stripped.trim();

  const values: Record<string, string> = { title: note.title, path: note.path, content };

  return options.template.replace(PLACEHOLDER, (match, key: string) => values[key] ?? match);
}
