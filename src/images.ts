import type { NoteReference } from './references.js';

/**
 * Finding a note's embedded images, from its already-resolved references.
 *
 * No Obsidian types touch this: `NoteReference.original` keeps the exact text
 * a link was written as, and an embed is anything starting with `!` — `![[…]]`
 * or `![…](…)` — regardless of syntax. That is enough to tell an embedded
 * image apart from an ordinary link or a note embed without re-reading the
 * cache.
 */

const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']);

function extensionOf(vaultPath: string): string {
  return vaultPath.slice(vaultPath.lastIndexOf('.') + 1).toLowerCase();
}

/**
 * The vault paths of every image a note embeds, in the order they first
 * appear.
 *
 * A withheld target is skipped entirely — an excluded note's images are as
 * off-limits as its text — and a target reached more than once contributes
 * only its first occurrence.
 *
 * @param references - A note body's resolved references.
 * @returns Deduplicated vault paths, image extensions only.
 */
export function embeddedImages(references: readonly NoteReference[]): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const item of references) {
    if (!item.original.startsWith('!')) continue;

    const target = item.target;

    if (!target || target.excluded) continue;
    if (!IMAGE_EXTENSIONS.has(extensionOf(target.vaultPath))) continue;
    if (seen.has(target.vaultPath)) continue;

    seen.add(target.vaultPath);
    paths.push(target.vaultPath);
  }

  return paths;
}
