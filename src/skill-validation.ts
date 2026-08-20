import type { SkillFrontmatter } from './skill-fields.js';

/**
 * Validation ported from skillset's `doctor` command
 * (github.com/stevekinney/skillset, `src/doctor.ts`), so a note that passes
 * here also passes `skillset doctor`. Errors block export and copy; warnings
 * don't.
 */

export type SkillIssueSeverity = 'error' | 'warning';

export type SkillIssue = {
  severity: SkillIssueSeverity;
  field: string;
  message: string;
};

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const XML_TAG_PATTERN = /<[^>]+>/;
const RESERVED_NAME_WORDS = ['anthropic', 'claude'];
const MAXIMUM_NAME_LENGTH = 64;
const MAXIMUM_DESCRIPTION_LENGTH = 1024;
const MAXIMUM_COMPATIBILITY_LENGTH = 500;
const RECOMMENDED_MAXIMUM_BODY_LINES = 500;

function error(field: string, message: string): SkillIssue {
  return { severity: 'error', field, message };
}

function warning(field: string, message: string): SkillIssue {
  return { severity: 'warning', field, message };
}

function checkName(name: string | undefined): SkillIssue[] {
  if (!name) return [error('name', 'Name is required.')];

  const issues: SkillIssue[] = [];

  if (!NAME_PATTERN.test(name)) {
    issues.push(
      error('name', 'Name must be lowercase alphanumeric with single hyphens between words.'),
    );
  }

  if (name.length > MAXIMUM_NAME_LENGTH) {
    issues.push(error('name', `Name exceeds ${MAXIMUM_NAME_LENGTH} characters.`));
  }

  for (const word of RESERVED_NAME_WORDS) {
    if (name.includes(word)) {
      issues.push(
        warning('name', `Name contains reserved word "${word}" — Claude's platform rejects it.`),
      );
    }
  }

  return issues;
}

function checkDescription(description: string | undefined): SkillIssue[] {
  if (!description || description.trim().length === 0) {
    return [error('description', 'Description is required.')];
  }

  const issues: SkillIssue[] = [];

  if (description.length > MAXIMUM_DESCRIPTION_LENGTH) {
    issues.push(
      error('description', `Description exceeds ${MAXIMUM_DESCRIPTION_LENGTH} characters.`),
    );
  }

  if (XML_TAG_PATTERN.test(description)) {
    issues.push(error('description', 'Description must not contain XML tags.'));
  }

  return issues;
}

function checkCompatibility(compatibility: string | undefined): SkillIssue[] {
  if (!compatibility || compatibility.length <= MAXIMUM_COMPATIBILITY_LENGTH) return [];

  return [
    error('compatibility', `Compatibility exceeds ${MAXIMUM_COMPATIBILITY_LENGTH} characters.`),
  ];
}

function checkBody(body: string): SkillIssue[] {
  const lineCount = body.length === 0 ? 0 : body.split('\n').length;

  if (lineCount <= RECOMMENDED_MAXIMUM_BODY_LINES) return [];

  return [
    warning(
      'body',
      `Body is ${lineCount} lines — skillset recommends staying under ${RECOMMENDED_MAXIMUM_BODY_LINES}.`,
    ),
  ];
}

/** Validate a skill's frontmatter and rendered body. */
export function validateSkill(frontmatter: SkillFrontmatter, body: string): SkillIssue[] {
  return [
    ...checkName(frontmatter.name),
    ...checkDescription(frontmatter.description),
    ...checkCompatibility(frontmatter.compatibility),
    ...checkBody(body),
  ];
}
