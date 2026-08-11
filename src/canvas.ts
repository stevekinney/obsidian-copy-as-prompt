/**
 * Reading an Obsidian Canvas as a curated context set.
 *
 * A canvas is already what this plugin otherwise asks you to assemble by hand:
 * a chosen set of notes, arranged, annotated with loose text, and grouped. So
 * rather than inventing a picker, we read the arrangement you already made.
 *
 * The types here mirror `obsidian/canvas.d.ts` rather than importing it, which
 * keeps this module free of Obsidian imports and therefore testable. The format
 * is a documented, versioned JSON file, so the duplication is cheap.
 */

/** A node in the canvas JSON, narrowed to the fields that matter here. */
export type CanvasNode = {
  id?: unknown;
  type?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  file?: unknown;
  subpath?: unknown;
  text?: unknown;
  url?: unknown;
  label?: unknown;
};

/** One thing to render, in the order it should appear. */
export type CanvasItem =
  | { kind: 'file'; file: string; subpath: string | undefined }
  | { kind: 'text'; text: string }
  | { kind: 'link'; url: string };

/** A group's worth of items, or the ungrouped remainder when `label` is null. */
export type CanvasSection = {
  label: string | null;
  items: CanvasItem[];
};

type Placed = { node: CanvasNode; x: number; y: number };

type Rect = { x: number; y: number; width: number; height: number; label: string | null };

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Parse canvas JSON into its nodes.
 *
 * A canvas that is malformed — hand-edited, half-synced, from a future version
 * — yields no nodes rather than throwing, so the command reports "nothing to
 * copy" instead of an unhandled error.
 *
 * @param json - The raw `.canvas` file contents.
 * @returns The nodes, or an empty array when the file cannot be read.
 */
export function parseCanvas(json: string): CanvasNode[] {
  try {
    const parsed: unknown = JSON.parse(json);

    if (typeof parsed !== 'object' || parsed === null || !('nodes' in parsed)) return [];

    const { nodes } = parsed;

    if (!Array.isArray(nodes)) return [];

    return nodes.filter(
      (node: unknown): node is CanvasNode => typeof node === 'object' && node !== null,
    );
  } catch {
    return [];
  }
}

/** Reading order: top to bottom, then left to right. */
function byPosition(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.y - b.y || a.x - b.x;
}

function toItem(node: CanvasNode): CanvasItem | null {
  const file = stringOf(node.file);
  const text = stringOf(node.text);
  const url = stringOf(node.url);

  if (node.type === 'file' && file) return { kind: 'file', file, subpath: stringOf(node.subpath) };
  if (node.type === 'text' && text) return { kind: 'text', text };
  if (node.type === 'link' && url) return { kind: 'link', url };

  return null;
}

/**
 * Find the tightest group containing a node's centre.
 *
 * Smallest-wins handles nested groups: a node inside a subgroup belongs to the
 * subgroup, not to the outer one that also encloses it.
 */
function groupFor(placed: Placed, groups: Rect[]): Rect | null {
  const centreX = placed.x + numberOf(placed.node.width) / 2;
  const centreY = placed.y + numberOf(placed.node.height) / 2;

  const containing = groups.filter(
    (group) =>
      centreX >= group.x &&
      centreX <= group.x + group.width &&
      centreY >= group.y &&
      centreY <= group.y + group.height,
  );

  return containing.toSorted((a, b) => a.width * a.height - b.width * b.height)[0] ?? null;
}

/**
 * Organize canvas nodes into ordered sections.
 *
 * Groups become sections named by their label; everything outside a group lands
 * in a single unlabelled section. Sections are ordered by where their first
 * item sits, so the prompt reads down the canvas the way you laid it out.
 *
 * @param nodes - The canvas nodes.
 * @returns Sections in reading order, each with its items in reading order.
 */
export function organizeCanvas(nodes: readonly CanvasNode[]): CanvasSection[] {
  const groups: Rect[] = nodes
    .filter((node) => node.type === 'group')
    .map((node) => ({
      x: numberOf(node.x),
      y: numberOf(node.y),
      width: numberOf(node.width),
      height: numberOf(node.height),
      label: stringOf(node.label) ?? null,
    }));

  const placed: Placed[] = nodes
    .filter((node) => node.type !== 'group')
    .map((node) => ({ node, x: numberOf(node.x), y: numberOf(node.y) }));

  const buckets = new Map<Rect | null, { order: { x: number; y: number }; items: CanvasItem[] }>();

  for (const entry of placed.toSorted(byPosition)) {
    const item = toItem(entry.node);

    if (!item) continue;

    const group = groupFor(entry, groups);
    const existing = buckets.get(group);

    if (existing) {
      existing.items.push(item);
      continue;
    }

    // A group's position orders it, so an empty-looking group still sorts
    // where it sits rather than where its first child happens to be.
    buckets.set(group, { order: group ?? entry, items: [item] });
  }

  return [...buckets.entries()]
    .toSorted(([, a], [, b]) => byPosition(a.order, b.order))
    .map(([group, bucket]) => ({ label: group?.label ?? null, items: bucket.items }));
}
