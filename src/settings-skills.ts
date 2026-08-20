import type { SettingsSection } from './settings-shared.js';

/**
 * Settings for the skill frontmatter panel: whether it opens itself, and
 * where "Export note as skill" writes to.
 */
export function renderSkillSettings(section: SettingsSection): void {
  section.heading('Skill notes');

  section.toggle(
    'skillPanel',
    'Open the skill panel automatically',
    "When a note's frontmatter has `skill: true`, open the skill frontmatter panel in the right sidebar.",
  );

  section.text(
    'skillExportFolder',
    'Skill export folder',
    'Absolute path to the folder that holds exported skill directories — a skillset source root\'s `skills/` folder, or `~/.claude/skills`. "Export note as skill" writes `<folder>/<name>/SKILL.md`. Empty disables export.',
    '~/Developer/skillset/skills',
  );
}
