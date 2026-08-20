/**
 * The Agent Skills frontmatter contract: which fields exist, how they group,
 * and what control edits each one.
 *
 * Field shapes and defaults are verified against three sources — the
 * agentskills.io specification, Claude Code's own schema, and skillset
 * (github.com/stevekinney/skillset) — so a note edited here passes skillset's
 * `doctor` command. Two known keys, `hooks` and `openai`, are nested shapes no
 * form control models honestly; they are preserved on write but are not
 * listed here as editable fields.
 */

/** Reasoning effort, per skillset's enum (Claude Code's binary also accepts an integer; skillset does not). */
export type SkillEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Where the skill runs. */
export type SkillContext = 'inline' | 'fork';

/** The shell frontmatter and inline commands run under. */
export type SkillShell = 'bash' | 'powershell';

/** The fields this panel can edit. Every field is optional — a fresh skill sets none of them. */
export type SkillFrontmatter = {
  name?: string;
  description?: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  'allowed-tools'?: string[];
  when_to_use?: string;
  'argument-hint'?: string;
  arguments?: string[];
  'disable-model-invocation'?: boolean;
  'user-invocable'?: boolean;
  'disallowed-tools'?: string[];
  model?: string;
  effort?: SkillEffort;
  context?: SkillContext;
  agent?: string;
  background?: boolean;
  paths?: string[];
  shell?: SkillShell;
};

/** Frontmatter keys this panel edits. */
export type SkillFieldKey = keyof SkillFrontmatter;

/** Nested-shape keys preserved on write but never edited by this panel. */
export const PRESERVED_FRONTMATTER_KEYS = ['hooks', 'openai'] as const;

/** Which portability group a field belongs to. */
export type SkillFieldGroup = 'standard' | 'claude';

export type SkillFieldControl =
  | { kind: 'text'; placeholder?: string }
  | { kind: 'textarea'; placeholder?: string; rows?: number }
  | { kind: 'toggle' }
  | { kind: 'list'; placeholder?: string }
  | { kind: 'pairs'; placeholder?: string }
  | { kind: 'select'; options: readonly SkillFieldOption[] };

export type SkillFieldOption = { value: string; label: string };

export type SkillField = {
  key: SkillFieldKey;
  name: string;
  description: string;
  group: SkillFieldGroup;
  control: SkillFieldControl;
};

export const SKILL_EFFORTS: readonly SkillEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
export const SKILL_CONTEXTS: readonly SkillContext[] = ['inline', 'fork'];
export const SKILL_SHELLS: readonly SkillShell[] = ['bash', 'powershell'];

function toOptions(values: readonly string[]): SkillFieldOption[] {
  return values.map((value) => ({ value, label: sentenceCase(value) }));
}

function sentenceCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/**
 * The field table, in display order.
 *
 * Adding a field is a data edit here, not a change to the view — it renders
 * whatever this array contains.
 */
export const SKILL_FIELDS: readonly SkillField[] = [
  // Group one — standard fields (agentskills.io spec, portable everywhere).
  {
    key: 'name',
    name: 'Name',
    description:
      'Lowercase, hyphenated, at most 64 characters. Must match the exported directory name.',
    group: 'standard',
    control: { kind: 'text', placeholder: 'my-skill' },
  },
  {
    key: 'description',
    name: 'Description',
    description: 'What the skill does and when to use it. Non-empty, at most 1024 characters.',
    group: 'standard',
    control: { kind: 'textarea', rows: 3 },
  },
  {
    key: 'license',
    name: 'License',
    description: 'A license name, or a reference to a bundled license file.',
    group: 'standard',
    control: { kind: 'text', placeholder: 'MIT' },
  },
  {
    key: 'compatibility',
    name: 'Compatibility',
    description:
      'Environment requirements — intended product, system packages, network access. At most 500 characters.',
    group: 'standard',
    control: { kind: 'text' },
  },
  {
    key: 'metadata',
    name: 'Metadata',
    description: 'Free-form key-value pairs for your own use, one per line as `key: value`.',
    group: 'standard',
    control: { kind: 'pairs' },
  },
  {
    key: 'allowed-tools',
    name: 'Allowed tools',
    description: 'Tools the skill may use without asking, comma or newline separated.',
    group: 'standard',
    control: { kind: 'list', placeholder: 'Read, Grep, Glob' },
  },

  // Group two — Claude Code fields. Ignored outside Claude Code, and rejected
  // outright by the claude.ai upload path.
  {
    key: 'when_to_use',
    name: 'When to use',
    description: 'Extra guidance appended to the description in the skill listing.',
    group: 'claude',
    control: { kind: 'textarea', rows: 2 },
  },
  {
    key: 'argument-hint',
    name: 'Argument hint',
    description: 'Shown after the command name, e.g. `[issue-number]`.',
    group: 'claude',
    control: { kind: 'text', placeholder: '[issue-number]' },
  },
  {
    key: 'arguments',
    name: 'Arguments',
    description:
      'Argument names, comma or newline separated, mapped to positions for `$name` substitution.',
    group: 'claude',
    control: { kind: 'list' },
  },
  {
    key: 'disable-model-invocation',
    name: 'Disable model invocation',
    description: 'Block the Skill tool from invoking this skill automatically.',
    group: 'claude',
    control: { kind: 'toggle' },
  },
  {
    key: 'user-invocable',
    name: 'User invocable',
    description: 'Show this skill in the `/` command menu.',
    group: 'claude',
    control: { kind: 'toggle' },
  },
  {
    key: 'disallowed-tools',
    name: 'Disallowed tools',
    description: 'Tools this skill may never use, comma or newline separated.',
    group: 'claude',
    control: { kind: 'list' },
  },
  {
    key: 'model',
    name: 'Model',
    description:
      'The model this skill runs under — `inherit`, `haiku`, `sonnet`, `opus`, `fable`, or a full model ID.',
    group: 'claude',
    control: { kind: 'text', placeholder: 'inherit' },
  },
  {
    key: 'effort',
    name: 'Effort',
    description: 'Reasoning effort for the model.',
    group: 'claude',
    control: { kind: 'select', options: toOptions(SKILL_EFFORTS) },
  },
  {
    key: 'context',
    name: 'Context',
    description: '`inline` expands into the current conversation; `fork` spawns a subagent.',
    group: 'claude',
    control: { kind: 'select', options: toOptions(SKILL_CONTEXTS) },
  },
  {
    key: 'agent',
    name: 'Agent',
    description: 'The subagent type to run, when context is `fork`.',
    group: 'claude',
    control: { kind: 'text' },
  },
  {
    key: 'background',
    name: 'Background',
    description: 'Run in the background rather than waiting inline, when context is `fork`.',
    group: 'claude',
    control: { kind: 'toggle' },
  },
  {
    key: 'paths',
    name: 'Paths',
    description: 'Glob patterns. The skill auto-loads only on matching files.',
    group: 'claude',
    control: { kind: 'list' },
  },
  {
    key: 'shell',
    name: 'Shell',
    description: 'The shell frontmatter and inline commands run under.',
    group: 'claude',
    control: { kind: 'select', options: toOptions(SKILL_SHELLS) },
  },
];

/**
 * Every key this panel edits, derived from {@link SKILL_FIELDS} rather than
 * listed by hand — adding a field here cannot leave the projection used for
 * note writes and skill export silently uncovering it.
 */
export const SKILL_FRONTMATTER_KEYS: readonly SkillFieldKey[] = SKILL_FIELDS.map(
  (field) => field.key,
);

type FieldValue<K extends SkillFieldKey> = Exclude<SkillFrontmatter[K], undefined>;

/** Field keys whose control is a single boolean toggle. */
export type BooleanFieldKey = {
  [K in SkillFieldKey]: FieldValue<K> extends boolean ? K : never;
}[SkillFieldKey];

/** Field keys whose control is free-form text. */
export type TextFieldKey = {
  [K in SkillFieldKey]: string extends FieldValue<K> ? K : never;
}[SkillFieldKey];

/** Field keys whose control edits a string list. */
export type StringListFieldKey = {
  [K in SkillFieldKey]: FieldValue<K> extends string[] ? K : never;
}[SkillFieldKey];
