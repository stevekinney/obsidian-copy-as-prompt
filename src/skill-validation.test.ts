import { describe, expect, it } from 'bun:test';

import { validateSkill } from './skill-validation.js';

function issues(frontmatter: Parameters<typeof validateSkill>[0], body = 'Body text.') {
  return validateSkill(frontmatter, body);
}

describe('validateSkill', () => {
  it('reports no issues for a minimal valid skill', () => {
    expect(issues({ name: 'my-skill', description: 'Does the thing.' })).toEqual([]);
  });

  it('requires a name', () => {
    expect(issues({ description: 'Does the thing.' })).toContainEqual({
      severity: 'error',
      field: 'name',
      message: 'Name is required.',
    });
  });

  it('rejects a name with uppercase letters or invalid characters', () => {
    const result = issues({ name: 'My_Skill', description: 'Thing.' });

    expect(result.some((issue) => issue.field === 'name' && issue.severity === 'error')).toBe(true);
  });

  it('rejects a name over 64 characters', () => {
    const result = issues({ name: 'a'.repeat(65), description: 'Thing.' });

    expect(result).toContainEqual({
      severity: 'error',
      field: 'name',
      message: 'Name exceeds 64 characters.',
    });
  });

  it('warns on a name containing a reserved word', () => {
    const result = issues({ name: 'claude-helper', description: 'Thing.' });

    expect(result).toContainEqual({
      severity: 'warning',
      field: 'name',
      message: 'Name contains reserved word "claude" — Claude\'s platform rejects it.',
    });
  });

  it('requires a non-empty description', () => {
    expect(issues({ name: 'my-skill' })).toContainEqual({
      severity: 'error',
      field: 'description',
      message: 'Description is required.',
    });

    expect(issues({ name: 'my-skill', description: '   ' })).toContainEqual({
      severity: 'error',
      field: 'description',
      message: 'Description is required.',
    });
  });

  it('rejects a description over 1024 characters', () => {
    const result = issues({ name: 'my-skill', description: 'x'.repeat(1025) });

    expect(result).toContainEqual({
      severity: 'error',
      field: 'description',
      message: 'Description exceeds 1024 characters.',
    });
  });

  it('rejects a description containing XML tags', () => {
    const result = issues({ name: 'my-skill', description: 'Do <b>the</b> thing.' });

    expect(result).toContainEqual({
      severity: 'error',
      field: 'description',
      message: 'Description must not contain XML tags.',
    });
  });

  it('allows compatibility up to 500 characters', () => {
    const result = issues({
      name: 'my-skill',
      description: 'Thing.',
      compatibility: 'x'.repeat(500),
    });

    expect(result.some((issue) => issue.field === 'compatibility')).toBe(false);
  });

  it('rejects compatibility over 500 characters', () => {
    const result = issues({
      name: 'my-skill',
      description: 'Thing.',
      compatibility: 'x'.repeat(501),
    });

    expect(result).toContainEqual({
      severity: 'error',
      field: 'compatibility',
      message: 'Compatibility exceeds 500 characters.',
    });
  });

  it('warns on a body over 500 lines', () => {
    const body = Array.from({ length: 501 }, (_, index) => `line ${index}`).join('\n');
    const result = issues({ name: 'my-skill', description: 'Thing.' }, body);

    expect(result).toContainEqual({
      severity: 'warning',
      field: 'body',
      message: 'Body is 501 lines — skillset recommends staying under 500.',
    });
  });

  it('does not warn on an empty body', () => {
    const result = issues({ name: 'my-skill', description: 'Thing.' }, '');

    expect(result.some((issue) => issue.field === 'body')).toBe(false);
  });
});
