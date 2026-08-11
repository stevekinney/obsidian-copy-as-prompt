import type { NoteBody, NoteReference, ResolvedTarget } from '../src/references.js';
import type { RenderableNote, RenderOptions } from '../src/render.js';

/**
 * Fixtures for the pure renderer.
 *
 * Offsets are derived from the text with `indexOf` rather than counted by hand.
 * Hand-counted offsets in a fixture are a test that passes for the wrong reason
 * the first time someone edits the sample note by a character.
 */

/** A resolved link target, defaulting to an ordinary note. */
export function target(overrides: Partial<ResolvedTarget> = {}): ResolvedTarget {
  return {
    vaultPath: 'Work/Design.md',
    displayPath: '~/Vaults/notes/Work/Design.md',
    absolutePath: '/Users/steve/Vaults/notes/Work/Design.md',
    title: 'Design',
    kind: 'note',
    ...overrides,
  };
}

/**
 * A reference located by searching `content` for its literal text.
 *
 * @param content - The note body the reference appears in.
 * @param original - The reference exactly as written.
 * @param overrides - Anything else about the reference.
 */
export function refAt(
  content: string,
  original: string,
  overrides: Partial<NoteReference> = {},
): NoteReference {
  const start = content.indexOf(original);

  if (start < 0) throw new Error(`Fixture error: ${original} is not in the content`);

  return {
    start,
    end: start + original.length,
    original,
    embed: original.startsWith('!'),
    target: target(),
    ...overrides,
  };
}

/** A note body with no cache edits unless given some. */
export function body(content: string, references: NoteReference[] = []): NoteBody {
  return { content, references, cacheEdits: [] };
}

/** A renderable note wrapping `body`. */
export function note(bodyValue: NoteBody, overrides: Partial<RenderableNote> = {}): RenderableNote {
  return {
    title: 'Meeting',
    vaultPath: 'Work/Meeting.md',
    displayPath: '~/Vaults/notes/Work/Meeting.md',
    body: bodyValue,
    ...overrides,
  };
}

/** Render options defaulting to paths mode with a passthrough template. */
export function options(overrides: Partial<RenderOptions> = {}): RenderOptions {
  return {
    mode: 'paths',
    template: '{{content}}',
    fenceContent: false,
    includeHeader: false,
    stripComments: true,
    stripDynamicBlocks: true,
    nameExcluded: false,
    ...overrides,
  };
}
