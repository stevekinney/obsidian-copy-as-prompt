/**
 * The Claude Code CLI flags, for autocompletion.
 *
 * Frontmatter keys are forwarded as `--key value`, so knowing the real flag
 * names turns a field where a typo silently produces a broken command into one
 * that suggests as you type. This catalog is advisory only: an unknown key is
 * still forwarded, because your CLI may be a wrapper, a fork, or simply newer
 * than this list.
 *
 * Transcribed from the CLI reference. Short aliases (`-p`, `-c`) are omitted
 * since a frontmatter key becomes a `--long-form` flag, and where a flag has
 * both camelCase and kebab-case spellings only the kebab-case one is listed.
 *
 * @see https://code.claude.com/docs/en/cli-reference#cli-flags
 */

/** One CLI flag. */
export type KnownFlag = {
  /** The flag name without leading dashes, as it would appear in frontmatter. */
  name: string;
  /** False for flags that are bare switches, which frontmatter sets to `true`. */
  takesValue: boolean;
  description: string;
};

export const KNOWN_FLAGS: readonly KnownFlag[] = [
  {
    name: 'add-dir',
    takesValue: true,
    description: 'Additional working directories to read and edit',
  },
  {
    name: 'advisor',
    takesValue: true,
    description: 'Enable the server-side advisor tool with a model',
  },
  { name: 'agent', takesValue: true, description: 'Agent for the current session' },
  { name: 'agents', takesValue: true, description: 'Define custom subagents via JSON' },
  {
    name: 'allow-dangerously-skip-permissions',
    takesValue: false,
    description: 'Add bypassPermissions to the mode cycle',
  },
  { name: 'allowed-tools', takesValue: true, description: 'Tools that execute without prompting' },
  {
    name: 'append-subagent-system-prompt',
    takesValue: true,
    description: "Append text to every subagent's system prompt",
  },
  {
    name: 'append-system-prompt',
    takesValue: true,
    description: 'Append text to the default system prompt',
  },
  {
    name: 'append-system-prompt-file',
    takesValue: true,
    description: 'Load extra system prompt text from a file',
  },
  { name: 'autocompact', takesValue: true, description: 'Auto-compact window for this session' },
  { name: 'ax-screen-reader', takesValue: false, description: 'Screen-reader friendly output' },
  { name: 'background', takesValue: false, description: 'Start the session as a background agent' },
  { name: 'bare', takesValue: false, description: 'Minimal mode: skip auto-discovery' },
  { name: 'betas', takesValue: true, description: 'Beta headers to include in API requests' },
  {
    name: 'channels',
    takesValue: true,
    description: 'MCP servers whose channel notifications to watch',
  },
  { name: 'chrome', takesValue: false, description: 'Enable Chrome browser integration' },
  { name: 'cloud', takesValue: true, description: 'Create or target a web session on claude.ai' },
  { name: 'continue', takesValue: false, description: 'Load the most recent conversation here' },
  {
    name: 'dangerously-load-development-channels',
    takesValue: true,
    description: 'Enable non-allowlisted channels',
  },
  {
    name: 'dangerously-skip-permissions',
    takesValue: false,
    description: 'Skip permission prompts',
  },
  { name: 'debug', takesValue: true, description: 'Debug mode, with optional category filtering' },
  { name: 'debug-file', takesValue: true, description: 'Write debug logs to a path' },
  { name: 'disable-slash-commands', takesValue: false, description: 'Disable skills and commands' },
  { name: 'disallowed-tools', takesValue: true, description: 'Deny rules for tools' },
  { name: 'effort', takesValue: true, description: 'Effort level for the current session' },
  {
    name: 'environment',
    takesValue: true,
    description: 'Create a cloud session on a self-hosted environment',
  },
  {
    name: 'exclude-dynamic-system-prompt-sections',
    takesValue: false,
    description: 'Move per-machine sections into the first message',
  },
  { name: 'exec', takesValue: true, description: 'Run a shell command as a PTY-backed job' },
  { name: 'fallback-model', takesValue: true, description: 'Automatic fallback to another model' },
  {
    name: 'fork-session',
    takesValue: false,
    description: 'Use a new session ID instead of reusing one',
  },
  {
    name: 'forward-subagent-text',
    takesValue: false,
    description: 'Emit subagent text in the output stream',
  },
  { name: 'from-pr', takesValue: true, description: 'Session picker filtered to a pull request' },
  { name: 'ide', takesValue: false, description: 'Connect to the IDE on startup' },
  {
    name: 'include-hook-events',
    takesValue: false,
    description: 'Include hook lifecycle events in output',
  },
  {
    name: 'include-partial-messages',
    takesValue: false,
    description: 'Include partial streaming events',
  },
  { name: 'init', takesValue: false, description: 'Run Setup hooks with the init matcher first' },
  {
    name: 'init-only',
    takesValue: false,
    description: 'Run Setup and SessionStart hooks, then exit',
  },
  { name: 'input-format', takesValue: true, description: 'Input format for print mode' },
  { name: 'json-schema', takesValue: true, description: 'Validated JSON output matching a schema' },
  {
    name: 'maintenance',
    takesValue: false,
    description: 'Run Setup hooks with the maintenance matcher',
  },
  {
    name: 'max-budget-usd',
    takesValue: true,
    description: 'Maximum dollars to spend on API calls',
  },
  { name: 'max-turns', takesValue: true, description: 'Limit the number of agentic turns' },
  { name: 'mcp-config', takesValue: true, description: 'Load MCP servers from JSON' },
  { name: 'model', takesValue: true, description: 'Model for the current session' },
  { name: 'name', takesValue: true, description: 'Display name for the session' },
  { name: 'no-chrome', takesValue: false, description: 'Disable Chrome browser integration' },
  { name: 'no-session-persistence', takesValue: false, description: 'Disable session persistence' },
  { name: 'output-format', takesValue: true, description: 'Output format for print mode' },
  {
    name: 'permission-mode',
    takesValue: true,
    description: 'Begin in a specified permission mode',
  },
  {
    name: 'permission-prompt-tool',
    takesValue: true,
    description: 'MCP tool that handles permission prompts',
  },
  { name: 'plugin-dir', takesValue: true, description: 'Load a plugin from a directory or zip' },
  { name: 'plugin-url', takesValue: true, description: 'Fetch a plugin zip from a URL' },
  { name: 'print', takesValue: false, description: 'Print the response without interactive mode' },
  {
    name: 'prompt-suggestions',
    takesValue: false,
    description: 'Emit a prompt suggestion after each turn',
  },
  { name: 'ref', takesValue: true, description: "Base the session's checkout on a named ref" },
  { name: 'remote-control', takesValue: false, description: 'Start with Remote Control enabled' },
  {
    name: 'remote-control-session-name-prefix',
    takesValue: true,
    description: 'Prefix for Remote Control session names',
  },
  {
    name: 'replay-user-messages',
    takesValue: false,
    description: 'Re-emit user messages back on stdout',
  },
  { name: 'resume', takesValue: true, description: 'Resume a session by ID or name' },
  { name: 'safe-mode', takesValue: false, description: 'Start with all customizations disabled' },
  { name: 'session-id', takesValue: true, description: 'Use a specific session ID' },
  { name: 'setting-sources', takesValue: true, description: 'Which setting sources to load' },
  {
    name: 'settings',
    takesValue: true,
    description: 'Path to a settings JSON file, or inline JSON',
  },
  {
    name: 'strict-mcp-config',
    takesValue: false,
    description: 'Only use MCP servers from --mcp-config',
  },
  { name: 'system-prompt', takesValue: true, description: 'Replace the entire system prompt' },
  {
    name: 'system-prompt-file',
    takesValue: true,
    description: 'Load the system prompt from a file',
  },
  { name: 'teammate-mode', takesValue: true, description: 'How agent team teammates display' },
  {
    name: 'teleport',
    takesValue: false,
    description: 'Resume a web session in your local terminal',
  },
  { name: 'tmux', takesValue: false, description: 'Create a tmux session for the worktree' },
  { name: 'tools', takesValue: true, description: 'Restrict which built-in tools are available' },
];

/**
 * Find known flags matching a query, best matches first.
 *
 * A prefix match ranks above a substring match, so typing `mo` offers `model`
 * before `permission-mode`.
 *
 * @param query - What the user has typed, with or without leading dashes.
 * @param exclude - Names already chosen, which are filtered out.
 * @returns Matching flags, ordered.
 */
export function matchFlags(query: string, exclude: readonly string[] = []): KnownFlag[] {
  const needle = query.trim().replace(/^-+/, '').toLowerCase();
  const taken = new Set(exclude);
  const available = KNOWN_FLAGS.filter((flag) => !taken.has(flag.name));

  if (!needle) return [...available];

  const prefix = available.filter((flag) => flag.name.startsWith(needle));
  const rest = available.filter(
    (flag) => !flag.name.startsWith(needle) && flag.name.includes(needle),
  );

  return [...prefix, ...rest];
}

/** Look a flag up by name, or null when it isn't one we know. */
export function findFlag(name: string): KnownFlag | null {
  return KNOWN_FLAGS.find((flag) => flag.name === name) ?? null;
}
