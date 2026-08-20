import { describe, expect, it } from 'bun:test';

import {
  PRESERVED_FRONTMATTER_KEYS,
  SKILL_FIELDS,
  SKILL_FRONTMATTER_KEYS,
} from './skill-fields.js';

describe('SKILL_FIELDS', () => {
  it('declares every field key once', () => {
    const keys = SKILL_FIELDS.map((field) => field.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('assigns every field to a known group', () => {
    for (const field of SKILL_FIELDS) {
      expect(['standard', 'claude']).toContain(field.group);
    }
  });

  it('gives every select field at least one option', () => {
    for (const field of SKILL_FIELDS) {
      if (field.control.kind !== 'select') continue;

      expect(field.control.options.length).toBeGreaterThan(0);
    }
  });

  it('capitalizes generated option labels', () => {
    const effort = SKILL_FIELDS.find((field) => field.key === 'effort');

    expect(effort?.control).toMatchObject({
      kind: 'select',
      options: expect.arrayContaining([{ value: 'low', label: 'Low' }]),
    });
  });

  it('never overlaps the preserved keys', () => {
    for (const key of PRESERVED_FRONTMATTER_KEYS) {
      expect(SKILL_FRONTMATTER_KEYS).not.toContain(key);
    }
  });
});

describe('SKILL_FRONTMATTER_KEYS', () => {
  it('is derived from the field table, in the same order', () => {
    expect(SKILL_FRONTMATTER_KEYS).toEqual(SKILL_FIELDS.map((field) => field.key));
  });
});
