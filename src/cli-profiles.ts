import type { PathStyle } from './paths.js';

/**
 * Starting points for the CLI tools people use.
 *
 * A profile is only data. Choosing one writes its values into the ordinary CLI
 * settings, which stay editable afterwards — so nothing here is a special case
 * in the code, and a tool nobody anticipated is configured the same way as one
 * that ships built in.
 *
 * Flag lists are advisory, used for autocompletion only. They are plain names
 * with no descriptions or arity, because the moment this file claims to know
 * what `--sandbox` means for four different tools it is wrong for three of them
 * and stale for the fourth. Paste more from `<tool> --help` as you need them.
 */

/** A tool's starting configuration. */
export type CliProfile = {
  id: string;
  name: string;
  /** The executable. */
  command: string;
  /** A subcommand between the executable and its flags, if the tool needs one. */
  subcommand: string;
  /** The flag that grants or sets directory access, without dashes. Empty if unknown. */
  directoryFlag: string;
  /** Frontmatter keys forwarded by default. */
  forwardKeys: string;
  /** How paths should be written for this tool. */
  pathStyle: PathStyle;
  /** Flag names offered by autocompletion. */
  knownFlags: string;
  /** Shown under the picker, so an unverified profile says so. */
  note: string;
};

/**
 * Claude Code.
 *
 * `--add-dir` grants access to a directory without changing the working
 * directory, so paths have to be absolute to resolve from wherever you are.
 */
const CLAUDE: CliProfile = {
  id: 'claude',
  name: 'Claude Code',
  command: 'claude',
  subcommand: '',
  directoryFlag: 'add-dir',
  forwardKeys: 'model, effort',
  pathStyle: 'absolute',
  knownFlags:
    'add-dir, agent, allowed-tools, append-system-prompt, disallowed-tools, effort, fallback-model, fork-session, max-budget-usd, max-turns, mcp-config, model, output-format, permission-mode, print, resume, session-id, settings, system-prompt, tools',
  note: 'Flags taken from the published CLI reference.',
};

/**
 * OpenAI Codex.
 *
 * `--cd` moves the working directory rather than adding one, which is why this
 * profile defaults to vault-relative paths: under `--cd <vault>` an absolute
 * path just repeats the directory you are already in. Reasoning effort is a
 * config override here (`-c model_reasoning_effort=…`) rather than a flag, so
 * `effort` is not forwarded.
 */
const CODEX: CliProfile = {
  id: 'codex',
  name: 'OpenAI Codex',
  command: 'codex',
  subcommand: '',
  directoryFlag: 'cd',
  forwardKeys: 'model',
  pathStyle: 'vault-relative',
  knownFlags: 'ask-for-approval, cd, config, json, model, profile, sandbox, search',
  note: 'Only documented flags are listed. If a bare prompt is not accepted, set the subcommand to exec.',
};

/** Google Gemini CLI. */
const GEMINI: CliProfile = {
  id: 'gemini',
  name: 'Gemini CLI',
  command: 'gemini',
  subcommand: '',
  directoryFlag: '',
  forwardKeys: 'model',
  pathStyle: 'absolute',
  knownFlags: 'model',
  note: 'Starting point only — fill in the directory flag and flag names from gemini --help.',
};

/** GitHub Copilot CLI. */
const COPILOT: CliProfile = {
  id: 'copilot',
  name: 'Copilot CLI',
  command: 'copilot',
  subcommand: '',
  directoryFlag: '',
  forwardKeys: 'model',
  pathStyle: 'absolute',
  knownFlags: 'model',
  note: 'Starting point only — fill in the directory flag and flag names from copilot --help.',
};

/** Everything blank, for a tool or wrapper of your own. */
const CUSTOM: CliProfile = {
  id: 'custom',
  name: 'Custom',
  command: '',
  subcommand: '',
  directoryFlag: '',
  forwardKeys: '',
  pathStyle: 'absolute',
  knownFlags: '',
  note: 'Configure everything below by hand.',
};

/** Built-in profiles, in the order the picker lists them. */
export const CLI_PROFILES: readonly CliProfile[] = [CLAUDE, CODEX, GEMINI, COPILOT, CUSTOM];

/** Look a profile up by id, or null when it isn't one of ours. */
export function findProfile(id: string): CliProfile | null {
  return CLI_PROFILES.find((profile) => profile.id === id) ?? null;
}

/**
 * Match flag names against what the user has typed.
 *
 * A prefix match ranks above a substring match, so typing `mo` offers `model`
 * before `permission-mode`. Names already chosen are filtered out.
 *
 * @param query - What the user has typed, with or without leading dashes.
 * @param available - Every name that could be offered.
 * @param exclude - Names already chosen.
 * @returns Matching names, best first.
 */
export function matchNames(
  query: string,
  available: readonly string[],
  exclude: readonly string[] = [],
): string[] {
  const needle = query.trim().replace(/^-+/, '').toLowerCase();
  const taken = new Set(exclude);
  const pool = available.filter((name) => !taken.has(name));

  if (!needle) return pool;

  const prefix = pool.filter((name) => name.toLowerCase().startsWith(needle));
  const rest = pool.filter(
    (name) => !name.toLowerCase().startsWith(needle) && name.toLowerCase().includes(needle),
  );

  return [...prefix, ...rest];
}
