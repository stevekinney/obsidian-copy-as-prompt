import { describe, expect, it } from 'bun:test';

import { serializeSkillFile, serializeYaml } from './skill-file.js';

describe('serializeYaml', () => {
  it('emits plain scalars unquoted', () => {
    expect(serializeYaml({ name: 'my-skill' })).toBe('name: my-skill\n');
  });

  it('emits booleans and numbers as bare values', () => {
    expect(serializeYaml({ background: true, count: 3 })).toBe('background: true\ncount: 3\n');
  });

  it('emits null for a null or undefined-through-a-container value', () => {
    expect(serializeYaml({ nested: { value: null } })).toBe('nested:\n  value: null\n');
  });

  it('skips a top-level key whose value is undefined', () => {
    expect(serializeYaml({ name: 'my-skill', missing: undefined })).toBe('name: my-skill\n');
  });

  it('quotes an empty string', () => {
    expect(serializeYaml({ name: '' })).toBe('name: ""\n');
  });

  it('quotes a string with leading or trailing whitespace', () => {
    expect(serializeYaml({ name: ' padded ' })).toBe('name: " padded "\n');
  });

  it('quotes a multi-line string', () => {
    expect(serializeYaml({ description: 'line one\nline two' })).toBe(
      'description: "line one\\nline two"\n',
    );
  });

  it('quotes a string starting with a YAML indicator character', () => {
    expect(serializeYaml({ name: '- dash' })).toBe('name: "- dash"\n');
    expect(serializeYaml({ name: '#hash' })).toBe('name: "#hash"\n');
  });

  it('quotes a string that looks like a mapping', () => {
    expect(serializeYaml({ name: 'key: value' })).toBe('name: "key: value"\n');
  });

  it('quotes true/false/null look-alikes', () => {
    expect(serializeYaml({ name: 'true' })).toBe('name: "true"\n');
    expect(serializeYaml({ name: 'NO' })).toBe('name: "NO"\n');
  });

  it('quotes a numeric-looking string', () => {
    expect(serializeYaml({ name: '42' })).toBe('name: "42"\n');
  });

  it('escapes backslashes and quotes inside a quoted string', () => {
    expect(serializeYaml({ name: 'a "quoted" \\ value' })).toBe(
      'name: "a \\"quoted\\" \\\\ value"\n',
    );
  });

  it('quotes a key that itself needs quoting', () => {
    expect(serializeYaml({ '': 'value' })).toBe('"": value\n');
  });

  it('emits a string list as a block sequence', () => {
    expect(serializeYaml({ 'allowed-tools': ['Read', 'Grep'] })).toBe(
      'allowed-tools:\n  - Read\n  - Grep\n',
    );
  });

  it('emits an empty array as flow style', () => {
    expect(serializeYaml({ 'allowed-tools': [] })).toBe('allowed-tools: []\n');
  });

  it('emits a nested plain object', () => {
    expect(serializeYaml({ metadata: { owner: 'steve', team: 'agents' } })).toBe(
      'metadata:\n  owner: steve\n  team: agents\n',
    );
  });

  it('emits an empty object as flow style', () => {
    expect(serializeYaml({ metadata: {} })).toBe('metadata: {}\n');
  });

  it('emits a list of objects with the map indented under the dash', () => {
    const yaml = serializeYaml({
      openai: {
        dependencies: {
          tools: [
            { type: 'mcp', value: 'linear' },
            { type: 'mcp', value: 'github' },
          ],
        },
      },
    });

    expect(yaml).toBe(
      'openai:\n  dependencies:\n    tools:\n      - type: mcp\n        value: linear\n      - type: mcp\n        value: github\n',
    );
  });

  it('throws for a value type this emitter was never meant to see', () => {
    const marker = Symbol('marker');

    expect(() => serializeYaml({ when: marker })).toThrow('Cannot emit a symbol as YAML');
  });
});

describe('serializeSkillFile', () => {
  it('fences the frontmatter and appends the body verbatim', () => {
    expect(serializeSkillFile({ name: 'my-skill' }, 'The body.\n')).toBe(
      '---\nname: my-skill\n---\nThe body.\n',
    );
  });

  it('produces a bare fence for an empty record', () => {
    expect(serializeSkillFile({}, 'Body.\n')).toBe('---\n---\nBody.\n');
  });
});
