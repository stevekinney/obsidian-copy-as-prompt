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
 * Wikilinks written into canvas prose.
 *
 * A canvas has no metadata cache, so this is the one place a regex has to stand
 * in for it. Without it, text cards and group labels were emitted verbatim:
 * `[[Design]]` stayed a wikilink instead of becoming a path, and an excluded
 * note named in a text card had its filename printed while the file node
 * pointing at the same note was correctly withheld.
 */
const WIKILINK = /!?\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|[^\]]*)?\]\]/g;

/** Record every wikilink in a run of canvas prose, offset into the body. */
function proseReferences(text: string, offset: number, resolve: TargetResolver): NoteReference[] {
  return [...text.matchAll(WIKILINK)].map((match) => ({
    start: offset + match.index,
    end: offset + match.index + match[0].length,
    original: match[0],
    anchor: match[2]?.trim(),
    target: resolve((match[1] ?? '').trim()),
  }));
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
      references.push(...proseReferences(section.label, content.length + 3, resolve));
      append(`## ${section.label}\n\n`);
    }

    section.items.forEach((item, index) => {
      if (index > 0) append('\n\n');

      if (item.kind === 'text') {
        references.push(...proseReferences(item.text, content.length, resolve));
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
