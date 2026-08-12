/**
 * Building a shell command that starts a session with the prompt.
 *
 * The whole prompt goes on a command line, which is a good way to get burned:
 * note text routinely contains quotes, backticks, `$`, and `!`, any of which a
 * shell will happily interpret. Single quotes are the only form where every one
 * of those is literal, so that is what this emits — with the one character
 * single quotes cannot contain, a single quote, spliced in explicitly.
 */

/** A flag derived from a note's frontmatter. */
export type CliFlag = {
  name: string;
  /** Empty for a bare boolean flag; one entry per repetition otherwise. */
  values: string[];
};

/** Everything needed to build the command. */
export type CommandOptions = {
  /** The executable, e.g. `claude`. */
  command: string;
  /** A subcommand between the executable and its flags, e.g. `exec`. Often empty. */
  subcommand: string;
  flags: CliFlag[];
  /** A directory to grant the session access to, if any. */
  addDir?: string | undefined;
  /** The flag name that grants directory access, without dashes. */
  addDirFlag: string;
  /** Arguments inserted verbatim before the prompt, e.g. `-p`. */
  extraArguments: string;
  prompt: string;
  /** Above this many characters, switch to a heredoc. */
  heredocThreshold: number;
};

/** The heredoc delimiter. Quoted at the opener, so the body is never expanded. */
const DELIMITER = 'PROMPT';

/**
 * Quote a value so a POSIX shell treats it as one literal argument.
 *
 * Everything inside single quotes is literal, including newlines. A single
 * quote itself is the sole exception, and the standard trick is to close the
 * string, emit an escaped quote, and reopen: `'` becomes `'\''`.
 *
 * @param value - The raw value.
 * @returns The value as a single quoted shell word.
 */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}

/**
 * Whether a value can appear on a command line without quoting.
 *
 * Used only for flag values, to keep `--model opus` from becoming
 * `--model 'opus'` and making every command noisier than it needs to be.
 */
function isBareWord(value: string): boolean {
  return /^[\w.:@/+-]+$/.test(value);
}

function renderValue(value: string): string {
  return isBareWord(value) ? value : shellQuote(value);
}

/**
 * Render a heredoc that substitutes nothing.
 *
 * The opening delimiter is quoted, which is what stops the shell expanding
 * `$variables` and backticks inside the body — without it, a note containing
 * `$PATH` would arrive at the model as your actual path.
 */
function heredoc(value: string): string {
  // A body line equal to the delimiter would terminate it early.
  const safe = value.replace(new RegExp(`^${DELIMITER}$`, 'gm'), ` ${DELIMITER}`);

  return `"$(cat <<'${DELIMITER}'\n${safe}\n${DELIMITER}\n)"`;
}

/**
 * Turn frontmatter into flags, keeping only the allowed keys.
 *
 * Forwarding is opt-in per key because ordinary Obsidian properties — `tags`,
 * `aliases`, `created` — would otherwise become flags the CLI rejects.
 *
 * Booleans become bare flags when true and vanish when false; arrays repeat the
 * flag once per entry; everything else is stringified.
 *
 * @param frontmatter - The note's frontmatter, or null when it has none.
 * @param allowed - Key names to forward.
 * @returns Flags in the order the allowlist gives, so commands stay stable.
 */
export function flagsFrom(
  frontmatter: Record<string, unknown> | null | undefined,
  allowed: readonly string[],
): CliFlag[] {
  const flags: CliFlag[] = [];

  for (const key of allowed) {
    const value = frontmatter?.[key];

    if (value === undefined || value === null || value === false) continue;

    if (value === true) {
      flags.push({ name: key, values: [] });

      continue;
    }

    const values = (Array.isArray(value) ? value : [value])
      .filter((entry) => entry !== null && entry !== undefined)
      .map((entry) => String(entry))
      .filter((entry) => entry.length > 0);

    if (values.length > 0) flags.push({ name: key, values });
  }

  return flags;
}

/** Render one flag as `--name value`, repeating the flag for each value. */
function renderFlag(flag: CliFlag): string[] {
  if (flag.values.length === 0) return [`--${flag.name}`];

  return flag.values.flatMap((value) => [`--${flag.name}`, renderValue(value)]);
}

/**
 * Build the full command.
 *
 * @param options - Executable, flags, directory access, and the prompt.
 * @returns A command ready to paste into a shell.
 */
export function buildCommand(options: CommandOptions): string {
  const parts = [options.command];
  const subcommand = options.subcommand.trim();

  if (subcommand) parts.push(subcommand);

  if (options.addDir && options.addDirFlag) {
    parts.push(`--${options.addDirFlag}`, renderValue(options.addDir));
  }

  for (const flag of options.flags) parts.push(...renderFlag(flag));

  // Inserted verbatim: this is a place to write shell, so quoting it would
  // break the very thing it exists for.
  const extra = options.extraArguments.trim();

  if (extra) parts.push(extra);

  const large = options.prompt.length > options.heredocThreshold;

  parts.push(large ? heredoc(options.prompt) : shellQuote(options.prompt));

  return parts.join(' ');
}
