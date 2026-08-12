import { commentEdits, dynamicBlockEdits, tidy } from './cleanup.js';
import { applyEdits, type Edit } from './edits.js';
import { reference } from './paths.js';
import { buildPrompt } from './prompt.js';
import { editFor, renderAsPath, type NoteBody } from './references.js';

/**
 * Assembling the final prompt.
 *
 * Every link becomes an `@` path the model can open for itself, which keeps the
 * payload small no matter how densely the vault is linked.
 */

/** Everything the renderer needs that isn't the note itself. */
export type RenderOptions = {
  template: string;
  fenceContent: boolean;
  includeHeader: boolean;
  stripComments: boolean;
  stripDynamicBlocks: boolean;
  /** Whether a withheld note's path appears alongside its placeholder. */
  nameExcluded: boolean;
};

/** A note the impure layer has finished resolving. */
export type RenderableNote = {
  title: string;
  vaultPath: string;
  displayPath: string;
  body: NoteBody;
  /** True when link traversal reached this note rather than you choosing it. */
  related?: boolean | undefined;
};

/**
 * Collect the edits that clean a body up, respecting the user's toggles.
 *
 * Cache-derived edits always apply; the text-matched ones are opt-out.
 */
function cleanupEdits(body: NoteBody, options: RenderOptions): Edit[] {
  return [
    ...body.cacheEdits,
    ...(options.stripComments ? commentEdits(body.content) : []),
    ...(options.stripDynamicBlocks ? dynamicBlockEdits(body.content) : []),
  ];
}

/**
 * Rewrite a note body: resolve every reference, strip what should be stripped.
 *
 * All the edits are gathered against the original text and applied in one
 * descending pass, so no edit ever sees offsets another has already shifted.
 */
function renderBody(body: NoteBody, options: RenderOptions): string {
  const edits = [
    ...body.references.map((item) => editFor(item, renderAsPath(item, options.nameExcluded))),
    ...cleanupEdits(body, options),
  ];

  return tidy(applyEdits(body.content, edits));
}

/**
 * Render the notes traversal reached as a list of paths.
 *
 * The agent can open them on demand, so including their text would multiply
 * the payload for nothing.
 */
function renderRelated(related: RenderableNote[]): string {
  const paths = related.map((note) => `- ${reference(note.displayPath)}`).join('\n');

  return `## Related notes\n\n${paths}`;
}

/**
 * Render one or more notes into a single prompt.
 *
 * With one note the template's `{{title}}` and `{{path}}` describe it directly.
 * With several — a multi-select or a whole folder — each note becomes its own
 * headed section inside `{{content}}`, and the placeholders describe the set,
 * since "a note titled X" is no longer a true sentence.
 *
 * @param notes - The resolved notes, in the order they should appear.
 * @param options - Template and the cleanup toggles.
 * @returns The prompt text.
 */
export function render(notes: RenderableNote[], options: RenderOptions): string {
  const chosen = notes.filter((note) => !note.related);
  const related = notes.filter((note) => note.related);

  const sections = chosen.map((note) => {
    const body = renderBody(note.body, options);

    return options.includeHeader ? `Source: ${reference(note.displayPath)}\n\n${body}` : body;
  });

  if (related.length > 0) sections.push(renderRelated(related));

  const single = chosen.length === 1 ? chosen[0] : undefined;

  return buildPrompt(
    {
      title: single?.title ?? `${chosen.length} notes`,
      path: single?.displayPath ?? '',
      content: sections.join('\n\n'),
    },
    { template: options.template, stripFrontmatter: false, fenceContent: options.fenceContent },
  );
}
