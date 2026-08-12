import { describe, expect, it } from 'bun:test';

import { body, note, options, refAt, target } from '../test/factories.js';
import { render } from './render.js';

describe('render', () => {
  it('resolves a wikilink to an @ path', () => {
    const content = 'See [[Design]] for limits.';

    expect(render([note(body(content, [refAt(content, '[[Design]]')]))], options())).toBe(
      'See @~/Vaults/notes/Work/Design.md for limits.',
    );
  });

  it('resolves several links in one line without shifting offsets', () => {
    const content = 'Compare [[Design]] and [[Design]] again.';
    const first = refAt(content, '[[Design]]');
    const start = content.lastIndexOf('[[Design]]');
    const second = { ...first, start, end: start + '[[Design]]'.length };

    expect(render([note(body(content, [first, second]))], options())).toBe(
      'Compare @~/Vaults/notes/Work/Design.md and @~/Vaults/notes/Work/Design.md again.',
    );
  });

  it('leaves a wikilink inside a code fence alone', () => {
    // Obsidian does not index links in code blocks, so no reference exists for
    // it and nothing rewrites it. This is the payoff for using cache offsets
    // instead of a regex over the raw text.
    const content = 'Real [[Design]]\n\n```md\nExample [[Design]]\n```';

    expect(render([note(body(content, [refAt(content, '[[Design]]')]))], options())).toBe(
      'Real @~/Vaults/notes/Work/Design.md\n\n```md\nExample [[Design]]\n```',
    );
  });

  it('leads with the source path when asked', () => {
    expect(render([note(body('Body'))], options({ includeHeader: true }))).toBe(
      'Source: @~/Vaults/notes/Work/Meeting.md\n\nBody',
    );
  });

  it('withholds an excluded target without naming it', () => {
    const content = 'See [[Diary]] for context.';
    const item = refAt(content, '[[Diary]]', {
      target: target({ vaultPath: 'Personal/Diary.md', excluded: true }),
    });

    expect(render([note(body(content, [item]))], options())).toBe('See [excluded] for context.');
  });

  it('names the withheld note when asked', () => {
    const content = 'See [[Diary]].';
    const item = refAt(content, '[[Diary]]', {
      target: target({ vaultPath: 'Personal/Diary.md', excluded: true }),
    });

    expect(render([note(body(content, [item]))], options({ nameExcluded: true }))).toBe(
      'See [excluded: Personal/Diary.md].',
    );
  });
});

describe('render cleanup', () => {
  it('strips comments and dynamic blocks by default', () => {
    const content = 'Keep %%drop this%% and\n\n```dataview\nTABLE x\n```\nkeep too.';

    expect(render([note(body(content))], options())).toBe('Keep and\n\nkeep too.');
  });

  it('leaves them alone when both toggles are off', () => {
    const content = 'Keep %%this%% now.';
    const result = render(
      [note(body(content))],
      options({ stripComments: false, stripDynamicBlocks: false }),
    );

    expect(result).toBe('Keep %%this%% now.');
  });

  it('applies cache edits such as frontmatter removal', () => {
    const content = '---\ntags: [a]\n---\nBody';
    const withCacheEdits = {
      ...body(content),
      cacheEdits: [{ start: 0, end: content.indexOf('Body'), replacement: '' }],
    };

    expect(render([note(withCacheEdits)], options())).toBe('Body');
  });
});

describe('render templating', () => {
  it('substitutes the note title and path', () => {
    const result = render(
      [note(body('Body'))],
      options({ template: '{{title}} at {{path}}:\n{{content}}' }),
    );

    expect(result).toBe('Meeting at ~/Vaults/notes/Work/Meeting.md:\nBody');
  });

  it('fences the content when asked', () => {
    expect(render([note(body('Body'))], options({ fenceContent: true }))).toBe(
      '```markdown\nBody\n```',
    );
  });

  it('gives each note its own section when several are rendered', () => {
    const notes = [
      note(body('First body'), { title: 'One', vaultPath: 'One.md', displayPath: '~/v/One.md' }),
      note(body('Second body'), { title: 'Two', vaultPath: 'Two.md', displayPath: '~/v/Two.md' }),
    ];

    expect(render(notes, options({ includeHeader: true }))).toBe(
      'Source: @~/v/One.md\n\nFirst body\n\nSource: @~/v/Two.md\n\nSecond body',
    );
  });

  it('describes the set rather than a single note when several are rendered', () => {
    const notes = [note(body('A')), note(body('B'))];

    expect(render(notes, options({ template: '{{title}}|{{path}}' }))).toBe('2 notes|');
  });
});

describe('render with link traversal', () => {
  it('lists related notes as paths rather than including their text', () => {
    const primary = note(body('Main body'));
    const reached = note(body('Other body'), {
      title: 'Other',
      displayPath: '~/v/Other.md',
      related: true,
    });

    expect(render([primary, reached], options())).toBe(
      'Main body\n\n## Related notes\n\n- @~/v/Other.md',
    );
  });

  it('counts only chosen notes when naming the set', () => {
    const notes = [note(body('A')), note(body('B'), { related: true })];

    expect(render(notes, options({ template: '{{title}}' }))).toBe('Meeting');
  });
});
