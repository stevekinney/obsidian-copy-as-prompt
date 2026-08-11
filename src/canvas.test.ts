import { describe, expect, it } from 'bun:test';

import { organizeCanvas, parseCanvas, type CanvasNode } from './canvas.js';

/** A node at a position, with whatever else the test needs. */
function node(overrides: Partial<CanvasNode> & { type: string }): CanvasNode {
  return { id: 'n', x: 0, y: 0, width: 100, height: 100, ...overrides };
}

describe('parseCanvas', () => {
  it('reads the nodes array', () => {
    expect(parseCanvas('{"nodes":[{"type":"text","text":"hi"}],"edges":[]}')).toHaveLength(1);
  });

  it('returns nothing for malformed JSON', () => {
    // A half-synced or hand-edited canvas should report "nothing to copy"
    // rather than throwing.
    expect(parseCanvas('{not json')).toEqual([]);
  });

  it('returns nothing when nodes is missing', () => {
    expect(parseCanvas('{"edges":[]}')).toEqual([]);
  });

  it('returns nothing when nodes is not an array', () => {
    expect(parseCanvas('{"nodes":"lots"}')).toEqual([]);
  });

  it('returns nothing for a JSON scalar', () => {
    expect(parseCanvas('42')).toEqual([]);
  });
});

describe('organizeCanvas', () => {
  it('reads top to bottom, then left to right', () => {
    const nodes = [
      node({ type: 'text', text: 'second', x: 0, y: 100 }),
      node({ type: 'text', text: 'first-right', x: 200, y: 0 }),
      node({ type: 'text', text: 'first-left', x: 0, y: 0 }),
    ];

    const [section] = organizeCanvas(nodes);

    expect(section?.items.map((item) => (item.kind === 'text' ? item.text : ''))).toEqual([
      'first-left',
      'first-right',
      'second',
    ]);
  });

  it('keeps each node kind', () => {
    const nodes = [
      node({ type: 'file', file: 'Work/Design.md', y: 0 }),
      node({ type: 'text', text: 'why?', y: 100 }),
      node({ type: 'link', url: 'https://example.com', y: 200 }),
    ];

    expect(organizeCanvas(nodes)[0]?.items).toEqual([
      { kind: 'file', file: 'Work/Design.md', subpath: undefined },
      { kind: 'text', text: 'why?' },
      { kind: 'link', url: 'https://example.com' },
    ]);
  });

  it('keeps a file node subpath', () => {
    const nodes = [node({ type: 'file', file: 'A.md', subpath: '#Heading' })];

    expect(organizeCanvas(nodes)[0]?.items[0]).toEqual({
      kind: 'file',
      file: 'A.md',
      subpath: '#Heading',
    });
  });

  it('drops a node missing its payload', () => {
    expect(organizeCanvas([node({ type: 'file' })])).toEqual([]);
  });

  it('drops an unknown node type', () => {
    expect(organizeCanvas([node({ type: 'sticker' })])).toEqual([]);
  });

  it('collects nodes into the group that contains them', () => {
    const nodes = [
      node({ type: 'group', label: 'Background', x: 0, y: 0, width: 500, height: 500 }),
      node({ type: 'file', file: 'A.md', x: 50, y: 50 }),
      node({ type: 'file', file: 'B.md', x: 50, y: 200 }),
    ];

    expect(organizeCanvas(nodes)).toEqual([
      {
        label: 'Background',
        items: [
          { kind: 'file', file: 'A.md', subpath: undefined },
          { kind: 'file', file: 'B.md', subpath: undefined },
        ],
      },
    ]);
  });

  it('assigns a node to the tightest enclosing group', () => {
    // Nested groups: the inner one wins, or nesting would be meaningless.
    const nodes = [
      node({ type: 'group', label: 'Outer', x: 0, y: 0, width: 1000, height: 1000 }),
      node({ type: 'group', label: 'Inner', x: 100, y: 100, width: 200, height: 200 }),
      node({ type: 'file', file: 'A.md', x: 120, y: 120, width: 50, height: 50 }),
    ];

    expect(organizeCanvas(nodes).map((section) => section.label)).toEqual(['Inner']);
  });

  it('puts ungrouped nodes in an unlabelled section', () => {
    const nodes = [
      node({ type: 'group', label: 'Group', x: 0, y: 0, width: 200, height: 200 }),
      node({ type: 'file', file: 'inside.md', x: 20, y: 20, width: 10, height: 10 }),
      node({ type: 'file', file: 'outside.md', x: 900, y: 900 }),
    ];

    expect(organizeCanvas(nodes)).toEqual([
      { label: 'Group', items: [{ kind: 'file', file: 'inside.md', subpath: undefined }] },
      { label: null, items: [{ kind: 'file', file: 'outside.md', subpath: undefined }] },
    ]);
  });

  it('orders sections by where they sit on the canvas', () => {
    const nodes = [
      node({ type: 'group', label: 'Lower', x: 0, y: 500, width: 200, height: 200 }),
      node({ type: 'file', file: 'low.md', x: 20, y: 520, width: 10, height: 10 }),
      node({ type: 'group', label: 'Upper', x: 0, y: 0, width: 200, height: 200 }),
      node({ type: 'file', file: 'high.md', x: 20, y: 20, width: 10, height: 10 }),
    ];

    expect(organizeCanvas(nodes).map((section) => section.label)).toEqual(['Upper', 'Lower']);
  });

  it('tolerates nodes with no coordinates', () => {
    const nodes = [{ type: 'text', text: 'floating' } as CanvasNode];

    expect(organizeCanvas(nodes)[0]?.items).toEqual([{ kind: 'text', text: 'floating' }]);
  });

  it('returns nothing for an empty canvas', () => {
    expect(organizeCanvas([])).toEqual([]);
  });
});
