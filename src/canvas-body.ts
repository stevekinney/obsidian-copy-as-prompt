import type { CanvasSection } from './canvas.js';
import type { NoteBody, NoteReference, ResolvedTarget } from './references.js';

/**
 * Turning a canvas into something the ordinary renderer can consume.
 *
 * Rather than teaching the renderer about canvases, we synthesize a note body
 * from the canvas layout: group labels become headings, text nodes become
 * prose, and file nodes become references with exact offsets. Because we build
 * the string ourselves we know precisely where each reference lands, so the
 * result flows through the same edit pipeline as a real note — and inherits
 * path resolution, exclusions, and both render modes for free.
 */

/** Looks a canvas file path up in the vault. Returns null when it resolves to nothing. */
export type TargetResolver = (file: string) => ResolvedTarget | null;

/** The placeholder a file node occupies before the renderer rewrites it. */
function placeholder(file: string): string {
  return `[[${file}]]`;
}

/**
 * Build a note body from organized canvas sections.
 *
 * @param sections - Canvas sections in reading order.
 * @param resolve - Resolves a canvas file path against the vault.
 * @returns A body with content and references, ready to render.
 */
export function buildCanvasBody(
  sections: readonly CanvasSection[],
  resolve: TargetResolver,
): NoteBody {
  const references: NoteReference[] = [];
  let content = '';

  const append = (text: string): void => {
    content += text;
  };

  for (const section of sections) {
    if (content.length > 0) append('\n\n');
    if (section.label) append(`## ${section.label}\n\n`);

    section.items.forEach((item, index) => {
      if (index > 0) append('\n\n');

      if (item.kind === 'text') {
        append(item.text);

        return;
      }

      if (item.kind === 'link') {
        append(item.url);

        return;
      }

      const original = placeholder(item.file);
      const start = content.length;

      append(original);

      references.push({
        start,
        end: start + original.length,
        original,
        anchor: item.subpath?.replace(/^#/, ''),
        // A canvas displays the note's content in place, so a file node is an
        // embed, not a link. Self-contained mode inlines it; paths mode still
        // emits an @path.
        embed: true,
        displayText: undefined,
        target: resolve(item.file),
      });
    });
  }

  return { content, references, cacheEdits: [] };
}
