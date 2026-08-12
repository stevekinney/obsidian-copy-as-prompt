import type { CanvasSection } from './canvas.js';
import type { NoteBody, NoteReference } from './references.js';
import { scanWikilinks, type TargetResolver } from './wikilinks.js';

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
    if (section.label) {
      references.push(...scanWikilinks(section.label, content.length + 3, resolve));
      append(`## ${section.label}\n\n`);
    }

    section.items.forEach((item, index) => {
      if (index > 0) append('\n\n');

      if (item.kind === 'text') {
        references.push(...scanWikilinks(item.text, content.length, resolve));
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
        target: resolve(item.file),
      });
    });
  }

  return { content, references, cacheEdits: [] };
}
