import { describe, expect, it } from 'bun:test';

import { parseSkillFrontmatter, toSkillRecord } from './skill-frontmatter.js';

describe('parseSkillFrontmatter', () => {
  it('reads every field from a well-formed block', () => {
    const { frontmatter } = parseSkillFrontmatter({
      name: 'my-skill',
      description: 'Does the thing.',
      license: 'MIT',
      compatibility: 'Requires network access.',
      metadata: { owner: 'steve' },
      'allowed-tools': ['Read', 'Grep'],
      when_to_use: 'When asked to do the thing.',
      'argument-hint': '[issue-number]',
      arguments: ['issue-number'],
      'disable-model-invocation': true,
      'user-invocable': false,
      'disallowed-tools': ['Bash'],
      model: 'opus',
      effort: 'high',
      context: 'fork',
      agent: 'general-purpose',
      background: true,
      paths: ['**/*.ts'],
      shell: 'bash',
    });

    expect(frontmatter).toEqual({
      name: 'my-skill',
      description: 'Does the thing.',
      license: 'MIT',
      compatibility: 'Requires network access.',
      metadata: { owner: 'steve' },
      'allowed-tools': ['Read', 'Grep'],
      when_to_use: 'When asked to do the thing.',
      'argument-hint': '[issue-number]',
      arguments: ['issue-number'],
      'disable-model-invocation': true,
      'user-invocable': false,
      'disallowed-tools': ['Bash'],
      model: 'opus',
      effort: 'high',
      context: 'fork',
      agent: 'general-purpose',
      background: true,
      paths: ['**/*.ts'],
      shell: 'bash',
    });
  });

  it('returns an empty frontmatter object for a non-object source', () => {
    expect(parseSkillFrontmatter(null).frontmatter).toEqual({});
    expect(parseSkillFrontmatter(undefined).frontmatter).toEqual({});
    expect(parseSkillFrontmatter('nope').frontmatter).toEqual({});
  });

  it('leaves a field unset when the value is the wrong type', () => {
    const { frontmatter } = parseSkillFrontmatter({
      name: 42,
      'disable-model-invocation': 'true',
      effort: 'ludicrous',
    });

    expect(frontmatter.name).toBeUndefined();
    expect(frontmatter['disable-model-invocation']).toBeUndefined();
    expect(frontmatter.effort).toBeUndefined();
  });

  it('drops an empty string, since that is the same as unset', () => {
    expect(parseSkillFrontmatter({ name: '' }).frontmatter.name).toBeUndefined();
  });

  it('accepts a comma-separated string for a list field, matching Claude Code', () => {
    const { frontmatter } = parseSkillFrontmatter({ 'allowed-tools': 'Read, Grep, Glob' });

    expect(frontmatter['allowed-tools']).toEqual(['Read', 'Grep', 'Glob']);
  });

  it('accepts a space-separated string for a list field, matching the spec', () => {
    const { frontmatter } = parseSkillFrontmatter({ 'allowed-tools': 'Read Grep Glob' });

    expect(frontmatter['allowed-tools']).toEqual(['Read', 'Grep', 'Glob']);
  });

  it('drops an empty list rather than keeping a zero-length array', () => {
    expect(
      parseSkillFrontmatter({ 'allowed-tools': [] }).frontmatter['allowed-tools'],
    ).toBeUndefined();
    expect(
      parseSkillFrontmatter({ 'allowed-tools': '' }).frontmatter['allowed-tools'],
    ).toBeUndefined();
  });

  it('rejects a list field holding non-string entries', () => {
    expect(
      parseSkillFrontmatter({ 'allowed-tools': ['Read', 3] }).frontmatter['allowed-tools'],
    ).toBeUndefined();
  });

  it('drops a non-string value from metadata but keeps its string siblings', () => {
    const { frontmatter } = parseSkillFrontmatter({
      metadata: { owner: 'steve', count: 3 },
    });

    expect(frontmatter.metadata).toEqual({ owner: 'steve' });
  });

  it('leaves metadata unset when it holds no strings at all, or is the wrong shape', () => {
    expect(parseSkillFrontmatter({ metadata: { count: 3 } }).frontmatter.metadata).toBeUndefined();
    expect(
      parseSkillFrontmatter({ metadata: ['not', 'a', 'map'] }).frontmatter.metadata,
    ).toBeUndefined();
    expect(parseSkillFrontmatter({ metadata: 'nope' }).frontmatter.metadata).toBeUndefined();
  });

  it('preserves hooks and openai verbatim without parsing them', () => {
    const hooks = {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] }],
    };
    const openai = { interface: { display_name: 'My skill' } };

    const { preserved } = parseSkillFrontmatter({ hooks, openai });

    expect(preserved).toEqual({ hooks, openai });
  });

  it('omits a preserved key that was never present', () => {
    expect(parseSkillFrontmatter({ name: 'my-skill' }).preserved).toEqual({});
  });
});

describe('toSkillRecord', () => {
  it('includes only the fields that are set', () => {
    const record = toSkillRecord(
      parseSkillFrontmatter({ name: 'my-skill', description: 'Thing.' }),
    );

    expect(record).toEqual({ name: 'my-skill', description: 'Thing.' });
  });

  it('emits nothing for a frontmatter block with no known fields', () => {
    expect(toSkillRecord(parseSkillFrontmatter({}))).toEqual({});
  });

  it('carries preserved keys through, alongside the edited fields', () => {
    const hooks = { PreToolUse: [] };
    const record = toSkillRecord(parseSkillFrontmatter({ name: 'my-skill', hooks }));

    expect(record).toEqual({ name: 'my-skill', hooks });
  });

  it('never includes Obsidian housekeeping keys, only known skill fields', () => {
    const record = toSkillRecord(
      parseSkillFrontmatter({ name: 'my-skill', skill: true, tags: ['agent'], aliases: ['x'] }),
    );

    expect(record).toEqual({ name: 'my-skill' });
  });
});
