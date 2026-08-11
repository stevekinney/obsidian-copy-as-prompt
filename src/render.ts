import { commentEdits, dynamicBlockEdits, tidy } from './cleanup.js';
import { applyEdits, type Edit } from './edits.js';
import { reference } from './paths.js';
import { buildPrompt, fence } from './prompt.js';
import {
  basename,
  editFor,
  renderAsPath,
  renderAsText,
  type NoteBody,
  type NoteReference,
} from './references.js';

/**
 * Assembling the final prompt.
 *
 * Two modes, decided by where the output is going. `paths` targets Claude Code
 * in a terminal: every link becomes an `@` path the model can open for itself,
 * which keeps the payload small. `self-contained` targets a browser chat, where
 * a path is a dead reference — embeds are inlined and images are reduced to
 * named placeholders plus a manifest of what to attach.
 */

/** Which of the two output shapes to produce. */
export type RenderMode = 'paths' | 'self-contained';

/** Everything the renderer needs that isn't the note itself. */
export type RenderOptions = {
  mode: RenderMode;
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
  /**
   * True when link traversal reached this note rather than you choosing it.
   * Related notes are summarized as paths in `paths` mode and inlined in
   * `self-contained` mode, since only one of those is useful to each reader.
   */
  related?: boolean | undefined;
};

/** An image the prompt refers to but cannot carry. */
export type ImageRef = {
  vaultPath: string;
  absolutePath: string;
};

/** The prompt, plus what the caller still has to do about images. */
export type RenderedPrompt = {
  text: string;
  /** Referenced images, deduplicated, in document order. */
  images: ImageRef[];
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
 * Render one reference, recursing into an embed whose body was loaded.
 *
 * Depth and cycle detection are settled before we get here: the impure layer
 * simply doesn't attach a `note` to a target it declined to expand, so an
 * embed past the depth limit falls through to the ordinary text rendering.
 */
function renderReference(item: NoteReference, options: RenderOptions, images: ImageRef[]): string {
  if (item.target?.kind === 'image') {
    images.push({ vaultPath: item.target.vaultPath, absolutePath: item.target.absolutePath });
  }

  if (options.mode === 'paths') return renderAsPath(item, options.nameExcluded);

  const inlined = item.embed ? item.target?.note : undefined;

  if (!inlined) return renderAsText(item, options.nameExcluded);

  const label = `[embedded: ${item.target?.vaultPath ?? ''}]`;

  return `${label}\n${fence(renderBody(inlined, options, images))}`;
}

/**
 * Rewrite a note body: resolve every reference, strip what should be stripped.
 *
 * All the edits are gathered against the original text and applied in one
 * descending pass, so no edit ever sees offsets another has already shifted.
 */
function renderBody(body: NoteBody, options: RenderOptions, images: ImageRef[]): string {
  const edits = [
    ...body.references.map((item) => editFor(item, renderReference(item, options, images))),
    ...cleanupEdits(body, options),
  ];

  return tidy(applyEdits(body.content, edits));
}

/** The line naming where the note came from, in the form each mode can use. */
function header(note: RenderableNote, mode: RenderMode): string {
  return mode === 'paths'
    ? `Source: @${note.displayPath}`
    : `Source: ${note.title} (${note.vaultPath})`;
}

/**
 * Render the notes traversal reached.
 *
 * In `paths` mode these become a list of `@paths` — Claude Code can open them
 * on demand, and inlining them would multiply the payload for nothing. In
 * `self-contained` mode there is no such option, so each one is included whole.
 */
function renderRelated(
  related: RenderableNote[],
  options: RenderOptions,
  images: ImageRef[],
): string {
  if (options.mode === 'paths') {
    const paths = related.map((note) => `- ${reference(note.displayPath)}`).join('\n');

    return `## Related notes\n\n${paths}`;
  }

  const bodies = related.map(
    (note) => `### ${note.title}\n\n${renderBody(note.body, options, images)}`,
  );

  return `## Related notes\n\n${bodies.join('\n\n')}`;
}

/** The trailing list of images a self-contained prompt can't carry inline. */
function attachmentManifest(images: ImageRef[]): string {
  if (images.length === 0) return '';

  const names = images.map((image) => `- ${basename(image.vaultPath)}`).join('\n');

  return `\n\n## Images to attach\n\n${names}`;
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
 * @param options - Mode, template, and the cleanup toggles.
 * @returns The prompt text and the images the caller may need to put on the clipboard.
 */
export function render(notes: RenderableNote[], options: RenderOptions): RenderedPrompt {
  const images: ImageRef[] = [];
  const chosen = notes.filter((note) => !note.related);
  const related = notes.filter((note) => note.related);

  const sections = chosen.map((note) => {
    const body = renderBody(note.body, options, images);

    return options.includeHeader ? `${header(note, options.mode)}\n\n${body}` : body;
  });

  if (related.length > 0) sections.push(renderRelated(related, options, images));

  const deduped = [...new Map(images.map((image) => [image.absolutePath, image])).values()];
  const single = chosen.length === 1 ? chosen[0] : undefined;

  const content = sections.join('\n\n');
  const text = buildPrompt(
    {
      title: single?.title ?? `${chosen.length} notes`,
      path: single?.displayPath ?? '',
      content,
    },
    { template: options.template, stripFrontmatter: false, fenceContent: options.fenceContent },
  );

  const manifest = options.mode === 'self-contained' ? attachmentManifest(deduped) : '';

  return { text: `${text}${manifest}`, images: deduped };
}
