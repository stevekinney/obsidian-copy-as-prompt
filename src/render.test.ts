import { describe, expect, it } from 'bun:test';

import { body, note, options, refAt, target } from '../test/factories.js';
import { render } from './render.js';

describe('render in paths mode', () => {
  it('resolves a wikilink to an @ path', () => {
    const content = 'See [[Design]] for limits.';
    const result = render([note(body(content, [refAt(content, '[[Design]]')]))], options());

    expect(result.text).toBe('See @~/Vaults/notes/Work/Design.md for limits.');
  });

  it('resolves several links in one line without shifting offsets', () => {
    const content = 'Compare [[Design]] and [[Design]] again.';
    const first = refAt(content, '[[Design]]');
    const second = { ...first, start: content.lastIndexOf('[[Design]]') };
    const secondRef = { ...second, end: second.start + '[[Design]]'.length };

    const result = render([note(body(content, [first, secondRef]))], options());

    expect(result.text).toBe(
      'Compare @~/Vaults/notes/Work/Design.md and @~/Vaults/notes/Work/Design.md again.',
    );
  });

  it('leaves a wikilink inside a code fence alone', () => {
    // Obsidian does not index links in code blocks, so no reference exists for
    // it and nothing rewrites it. This is the payoff for using cache offsets
    // instead of a regex over the raw text.
    const content = 'Real [[Design]]\n\n```md\nExample [[Design]]\n```';
    const result = render([note(body(content, [refAt(content, '[[Design]]')]))], options());

    expect(result.text).toBe(
      'Real @~/Vaults/notes/Work/Design.md\n\n```md\nExample [[Design]]\n```',
    );
  });

  it('renders images as paths too', () => {
    const content = 'Diagram: ![[diagram.png]]';
    const image = refAt(content, '![[diagram.png]]', {
      target: target({
        kind: 'image',
        vaultPath: 'attachments/diagram.png',
        displayPath: '~/Vaults/notes/attachments/diagram.png',
        absolutePath: '/Users/steve/Vaults/notes/attachments/diagram.png',
      }),
    });

    const result = render([note(body(content, [image]))], options());

    expect(result.text).toBe('Diagram: @~/Vaults/notes/attachments/diagram.png');
  });

  it('adds no image manifest', () => {
    const content = '![[diagram.png]]';
    const image = refAt(content, '![[diagram.png]]', {
      target: target({ kind: 'image', vaultPath: 'attachments/diagram.png' }),
    });

    expect(render([note(body(content, [image]))], options()).text).not.toContain(
      'Images to attach',
    );
  });

  it('leads with an @ path header when asked', () => {
    const result = render([note(body('Body'))], options({ includeHeader: true }));

    expect(result.text).toBe('Source: @~/Vaults/notes/Work/Meeting.md\n\nBody');
  });
});

describe('render in self-contained mode', () => {
  const selfContained = options({ mode: 'self-contained' });

  it('collapses a link to its display text', () => {
    const content = 'See [[Design|the API contract]] for limits.';
    const item = refAt(content, '[[Design|the API contract]]', { displayText: 'the API contract' });

    expect(render([note(body(content, [item]))], selfContained).text).toBe(
      'See the API contract for limits.',
    );
  });

  it('inlines an embedded note that was loaded', () => {
    const content = 'Context:\n\n![[Design]]';
    const item = refAt(content, '![[Design]]', {
      target: target({ note: { content: 'The design body.', references: [], cacheEdits: [] } }),
    });

    expect(render([note(body(content, [item]))], selfContained).text).toBe(
      'Context:\n\n[embedded: Work/Design.md]\n```markdown\nThe design body.\n```',
    );
  });

  it('resolves references inside an inlined embed', () => {
    const inner = 'Inner links to [[Design]].';
    const outer = 'Outer:\n\n![[Design]]';
    const item = refAt(outer, '![[Design]]', {
      target: target({
        note: { content: inner, references: [refAt(inner, '[[Design]]')], cacheEdits: [] },
      }),
    });

    expect(render([note(body(outer, [item]))], selfContained).text).toContain(
      'Inner links to Design.',
    );
  });

  it('falls back to text for an embed the depth limit stopped', () => {
    // The impure layer signals "not expanded" by leaving `note` off the target.
    const content = 'Context:\n\n![[Design]]';
    const item = refAt(content, '![[Design]]');

    expect(render([note(body(content, [item]))], selfContained).text).toBe('Context:\n\nDesign');
  });

  it('replaces an image with a placeholder and lists it', () => {
    const content = 'As shown: ![[diagram.png]]';
    const item = refAt(content, '![[diagram.png]]', {
      target: target({
        kind: 'image',
        vaultPath: 'attachments/diagram.png',
        absolutePath: '/Users/steve/Vaults/notes/attachments/diagram.png',
      }),
    });

    const result = render([note(body(content, [item]))], selfContained);

    expect(result.text).toBe(
      'As shown: [image: diagram.png]\n\n## Images to attach\n\n- diagram.png',
    );
    expect(result.images).toEqual([
      {
        vaultPath: 'attachments/diagram.png',
        absolutePath: '/Users/steve/Vaults/notes/attachments/diagram.png',
      },
    ]);
  });

  it('deduplicates an image referenced twice', () => {
    const content = '![[diagram.png]] and again ![[diagram.png]]';
    const targetValue = target({
      kind: 'image',
      vaultPath: 'attachments/diagram.png',
      absolutePath: '/Users/steve/Vaults/notes/attachments/diagram.png',
    });
    const first = refAt(content, '![[diagram.png]]', { target: targetValue });
    const start = content.lastIndexOf('![[diagram.png]]');
    const second = { ...first, start, end: start + '![[diagram.png]]'.length };

    const result = render([note(body(content, [first, second]))], selfContained);

    expect(result.images).toHaveLength(1);
    expect(result.text).toContain('- diagram.png');
  });

  it('leads with a title header when asked', () => {
    const result = render(
      [note(body('Body'))],
      options({ mode: 'self-contained', includeHeader: true }),
    );

    expect(result.text).toBe('Source: Meeting (Work/Meeting.md)\n\nBody');
  });
});

describe('render cleanup', () => {
  it('strips comments and dynamic blocks by default', () => {
    const content = 'Keep %%drop this%% and\n\n```dataview\nTABLE x\n```\nkeep too.';

    expect(render([note(body(content))], options()).text).toBe('Keep  and\n\nkeep too.');
  });

  it('leaves them alone when both toggles are off', () => {
    const content = 'Keep %%this%% now.';
    const result = render(
      [note(body(content))],
      options({ stripComments: false, stripDynamicBlocks: false }),
    );

    expect(result.text).toBe('Keep %%this%% now.');
  });

  it('applies cache edits such as frontmatter removal', () => {
    const content = '---\ntags: [a]\n---\nBody';
    const withCacheEdits = {
      ...body(content),
      cacheEdits: [{ start: 0, end: content.indexOf('Body'), replacement: '' }],
    };

    expect(render([note(withCacheEdits)], options()).text).toBe('Body');
  });
});

describe('render templating', () => {
  it('substitutes the note title and path', () => {
    const result = render(
      [note(body('Body'))],
      options({ template: '{{title}} at {{path}}:\n{{content}}' }),
    );

    expect(result.text).toBe('Meeting at ~/Vaults/notes/Work/Meeting.md:\nBody');
  });

  it('fences the content when asked', () => {
    const result = render([note(body('Body'))], options({ fenceContent: true }));

    expect(result.text).toBe('```markdown\nBody\n```');
  });

  it('gives each note its own section when several are rendered', () => {
    const notes = [
      note(body('First body'), { title: 'One', vaultPath: 'One.md', displayPath: '~/v/One.md' }),
      note(body('Second body'), { title: 'Two', vaultPath: 'Two.md', displayPath: '~/v/Two.md' }),
    ];

    const result = render(notes, options({ includeHeader: true }));

    expect(result.text).toBe(
      'Source: @~/v/One.md\n\nFirst body\n\nSource: @~/v/Two.md\n\nSecond body',
    );
  });

  it('describes the set rather than a single note when several are rendered', () => {
    const notes = [note(body('A')), note(body('B'))];
    const result = render(notes, options({ template: '{{title}}|{{path}}' }));

    expect(result.text).toBe('2 notes|');
  });
});

describe('render with exclusions and traversal', () => {
  it('withholds an excluded target without naming it', () => {
    // The filename is often the sensitive part, so the placeholder carries no
    // path — a prompt that names what it refused to include leaks the thing
    // the rule existed to protect.
    const content = 'See [[Diary]] for context.';
    const item = refAt(content, '[[Diary]]', {
      target: target({ vaultPath: 'Personal/Diary.md', excluded: true }),
    });

    expect(render([note(body(content, [item]))], options()).text).toBe(
      'See [excluded] for context.',
    );
  });

  it('withholds an excluded target in self-contained mode too', () => {
    const content = 'See [[Diary]].';
    const item = refAt(content, '[[Diary]]', { target: target({ excluded: true }) });

    expect(render([note(body(content, [item]))], options({ mode: 'self-contained' })).text).toBe(
      'See [excluded].',
    );
  });

  it('summarizes related notes as paths', () => {
    const primary = note(body('Main body'));
    const reached = note(body('Other body'), {
      title: 'Other',
      displayPath: '~/v/Other.md',
      related: true,
    });

    expect(render([primary, reached], options()).text).toBe(
      'Main body\n\n## Related notes\n\n- @~/v/Other.md',
    );
  });

  it('inlines related notes when the prompt must stand alone', () => {
    const primary = note(body('Main body'));
    const reached = note(body('Other body'), { title: 'Other', related: true });

    expect(render([primary, reached], options({ mode: 'self-contained' })).text).toBe(
      'Main body\n\n## Related notes\n\n### Other\n\nOther body',
    );
  });

  it('counts only chosen notes when naming the set', () => {
    const notes = [note(body('A')), note(body('B'), { related: true })];

    expect(render(notes, options({ template: '{{title}}' })).text).toBe('Meeting');
  });
});

describe('render naming of excluded notes', () => {
  const content = 'See [[Diary]].';
  const item = refAt(content, '[[Diary]]', {
    target: target({ vaultPath: 'Personal/Diary.md', excluded: true }),
  });

  it('names the withheld note when asked', () => {
    expect(render([note(body(content, [item]))], options({ nameExcluded: true })).text).toBe(
      'See [excluded: Personal/Diary.md].',
    );
  });

  it('says nothing about it by default', () => {
    expect(render([note(body(content, [item]))], options()).text).toBe('See [excluded].');
  });
});
