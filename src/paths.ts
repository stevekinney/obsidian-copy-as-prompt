/**
 * Turning vault paths into references a model can act on.
 *
 * `@` is the mention syntax coding agents share, so it is fixed rather than
 * configurable. Paths containing whitespace are wrapped in backticks: bare,
 * `@~/Vaults/Kubernetes notes.md` parses as a path followed by a stray word,
 * and Obsidian note titles have spaces constantly.
 */

/**
 * How a path should be written out.
 *
 * `absolute` shortens the home directory to `~`, which is compact and keeps
 * your account name out of anything you paste. That relies on whatever reads
 * the path expanding `~` — inside a single-quoted shell argument the shell
 * will not, so `absolute-full` exists for tools that take the path literally.
 */
export type PathStyle = 'absolute' | 'absolute-full' | 'vault-relative';

/**
 * Join a vault's absolute base path with a vault-relative path.
 *
 * @param basePath - The vault's absolute location on disk, no trailing slash.
 * @param vaultPath - A vault-relative path, e.g. `Work/Design.md`.
 * @returns The absolute path.
 */
export function absolutePath(basePath: string, vaultPath: string): string {
  return `${basePath.replace(/\/+$/, '')}/${vaultPath}`;
}

/**
 * Replace a leading home directory with `~`.
 *
 * Shorter, and it keeps the user's account name out of anything they paste
 * into a chat window.
 *
 * @param path - An absolute path.
 * @param home - The absolute home directory, e.g. `/Users/steve`.
 * @returns The path with `~` substituted when it applies.
 */
export function withTilde(path: string, home: string): string {
  const normalized = home.replace(/\/+$/, '');

  if (!normalized) return path;
  if (path === normalized) return '~';
  if (path.startsWith(`${normalized}/`)) return `~${path.slice(normalized.length)}`;

  return path;
}

/**
 * Format a path as an `@` reference.
 *
 * @param path - The path to reference, already in its display form.
 * @returns The reference, backtick-wrapped if the path contains whitespace.
 */
export function reference(path: string): string {
  return /\s/.test(path) ? `\`@${path}\`` : `@${path}`;
}

/**
 * Build the display form of a vault path under the configured style.
 *
 * `displayBase` is deliberately separate from the vault's real location. When
 * the thing reading these paths lives somewhere else — WSL, a devcontainer, the
 * far end of an SSH session — the local path is meaningless to it, and the only
 * fix is to emit the path as that environment sees it.
 *
 * @param vaultPath - A vault-relative path.
 * @param context - The base path to emit under, and the user's home directory.
 * @param style - Absolute with `~`, absolute in full, or vault-relative.
 * @returns The path as it should appear in the prompt.
 */
export function displayPath(
  vaultPath: string,
  context: { displayBase: string; home: string },
  style: PathStyle,
): string {
  if (style === 'vault-relative') return vaultPath;

  const absolute = absolutePath(context.displayBase, vaultPath);

  return style === 'absolute-full' ? absolute : withTilde(absolute, context.home);
}
