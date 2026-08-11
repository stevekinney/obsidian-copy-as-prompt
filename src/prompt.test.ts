import { describe, expect, it } from 'bun:test';

import { buildPrompt, fence, stripFrontmatter, type PromptOptions } from './prompt.js';

const options: PromptOptions = {
  template: '{{title}} ({{path}})\n\n{{content}}',
  stripFrontmatter: true,
  fenceContent: false,
};

it('loads the test preload', () => {
  expect((globalThis as Record<string, unknown>)['__BUN_TEST_SETUP_LOADED__']).toBe(true);
});

describe('stripFrontmatter', () => {
  it('removes a leading YAML block', () => {
    expect(stripFrontmatter('---\ntags: [a]\n---\nBody')).toBe('Body');
  });

  it('handles CRLF line endings', () => {
    expect(stripFrontmatter('---\r\ntags: [a]\r\n---\r\nBody')).toBe('Body');
  });

  it('leaves a horizontal rule further down alone', () => {
    const source = 'Intro\n\n---\n\nMore';
    expect(stripFrontmatter(source)).toBe(source);
  });

  it('leaves a note without frontmatter alone', () => {
    expect(stripFrontmatter('# Title\n')).toBe('# Title\n');
  });

  it('handles a frontmatter block with nothing after it', () => {
    expect(stripFrontmatter('---\ntags: [a]\n---')).toBe('');
  });
});

describe('fence', () => {
  it('wraps content in a markdown fence', () => {
    expect(fence('hello')).toBe('```markdown\nhello\n```');
  });

  it('grows the fence past any run already in the content', () => {
    expect(fence('```js\nx\n```')).toBe('````markdown\n```js\nx\n```\n````');
  });

  it('grows past an indented fence too', () => {
    expect(fence('  `````\nx\n  `````')).toBe('``````markdown\n  `````\nx\n  `````\n``````');
  });
});

describe('buildPrompt', () => {
  const note = { title: 'Note', path: 'folder/Note.md', content: '---\na: b\n---\nBody' };

  it('substitutes every placeholder', () => {
    expect(buildPrompt(note, options)).toBe('Note (folder/Note.md)\n\nBody');
  });

  it('keeps frontmatter when asked to', () => {
    expect(buildPrompt(note, { ...options, stripFrontmatter: false })).toBe(
      'Note (folder/Note.md)\n\n---\na: b\n---\nBody',
    );
  });

  it('fences the content when asked to', () => {
    expect(buildPrompt(note, { ...options, fenceContent: true })).toBe(
      'Note (folder/Note.md)\n\n```markdown\nBody\n```',
    );
  });

  it('does not re-expand a placeholder that appears inside the note', () => {
    const sneaky = { ...note, content: 'See {{title}}' };
    expect(buildPrompt(sneaky, options)).toBe('Note (folder/Note.md)\n\nSee {{title}}');
  });

  it('leaves an unknown placeholder untouched', () => {
    expect(buildPrompt(note, { ...options, template: '{{author}} {{title}}' })).toBe(
      '{{author}} Note',
    );
  });

  it('trims surrounding whitespace from the content', () => {
    expect(buildPrompt({ ...note, content: '\n\nBody\n\n' }, options)).toBe(
      'Note (folder/Note.md)\n\nBody',
    );
  });
});
