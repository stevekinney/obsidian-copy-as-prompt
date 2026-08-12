import { describe, expect, it } from 'bun:test';

import { target } from '../test/factories.js';
import { buildCanvasBody } from './canvas-body.js';
import type { CanvasSection } from './canvas.js';

const resolve = (file: string) => (file === 'missing.md' ? null : target({ vaultPath: file }));

describe('buildCanvasBody', () => {
  it('renders a text node as prose', () => {
    const sections: CanvasSection[] = [{ label: null, items: [{ kind: 'text', text: 'Why?' }] }];

    expect(buildCanvasBody(sections, resolve).content).toBe('Why?');
  });

  it('turns a group label into a heading', () => {
    const sections: CanvasSection[] = [
      { label: 'Background', items: [{ kind: 'text', text: 'Context.' }] },
    ];

    expect(buildCanvasBody(sections, resolve).content).toBe('## Background\n\nContext.');
  });

  it('separates sections and items with blank lines', () => {
    const sections: CanvasSection[] = [
      {
        label: 'One',
        items: [
          { kind: 'text', text: 'a' },
          { kind: 'text', text: 'b' },
        ],
      },
      { label: 'Two', items: [{ kind: 'text', text: 'c' }] },
    ];

    expect(buildCanvasBody(sections, resolve).content).toBe('## One\n\na\n\nb\n\n## Two\n\nc');
  });

  it('records a file node as a reference at the right offset', () => {
    const sections: CanvasSection[] = [
      {
        label: null,
        items: [
          { kind: 'text', text: 'See:' },
          { kind: 'file', file: 'Work/Design.md', subpath: undefined },
        ],
      },
    ];

    const body = buildCanvasBody(sections, resolve);
    const [reference] = body.references;

    expect(body.content.slice(reference?.start, reference?.end)).toBe('[[Work/Design.md]]');
    expect(reference?.target?.vaultPath).toBe('Work/Design.md');
  });

  it('keeps a file node subpath as an anchor', () => {
    const sections: CanvasSection[] = [
      { label: null, items: [{ kind: 'file', file: 'A.md', subpath: '#Limits' }] },
    ];

    expect(buildCanvasBody(sections, resolve).references[0]?.anchor).toBe('Limits');
  });

  it('leaves an unresolvable file node without a target', () => {
    const sections: CanvasSection[] = [
      { label: null, items: [{ kind: 'file', file: 'missing.md', subpath: undefined }] },
    ];

    const [reference] = buildCanvasBody(sections, resolve).references;

    expect(reference?.target).toBeNull();
    expect(reference?.original).toBe('[[missing.md]]');
  });

  it('renders a link node as its URL', () => {
    const sections: CanvasSection[] = [
      { label: null, items: [{ kind: 'link', url: 'https://example.com' }] },
    ];

    expect(buildCanvasBody(sections, resolve).content).toBe('https://example.com');
  });

  it('records offsets that survive several file nodes', () => {
    const sections: CanvasSection[] = [
      {
        label: 'Files',
        items: [
          { kind: 'file', file: 'A.md', subpath: undefined },
          { kind: 'file', file: 'B.md', subpath: undefined },
        ],
      },
    ];

    const body = buildCanvasBody(sections, resolve);

    for (const reference of body.references) {
      expect(body.content.slice(reference.start, reference.end)).toBe(reference.original);
    }
  });

  it('produces an empty body for an empty canvas', () => {
    expect(buildCanvasBody([], resolve)).toEqual({ content: '', references: [], cacheEdits: [] });
  });
});
