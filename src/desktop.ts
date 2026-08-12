import { Platform } from 'obsidian';

/**
 * Reaching Node from inside Obsidian, safely.
 *
 * `manifest.json` says `isDesktopOnly: false`, which is a promise that this
 * plugin loads on iOS and Android. That promise is kept by never importing
 * `node:*` at module scope: a static import becomes a top-level `require` in
 * the bundle and takes the whole plugin down on mobile before any guard can
 * run. The lookup below goes through the global `require` Obsidian exposes on
 * desktop, behind a platform check, so the bundler never records a dependency
 * at all.
 */

type NodeRequire = (id: string) => unknown;

/** Whether `value` has a callable property called `key`. */
function hasFunction(value: unknown, key: string): boolean {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, key) === 'function'
  );
}

function isRequire(value: unknown): value is NodeRequire {
  return typeof value === 'function';
}

/** The desktop-only global `require`, or null on mobile. */
function nodeRequire(): NodeRequire | null {
  if (!Platform.isDesktopApp) return null;

  const candidate: unknown = (globalThis as { require?: unknown }).require;

  return isRequire(candidate) ? candidate : null;
}

function isOs(value: unknown): value is { homedir(): string } {
  return hasFunction(value, 'homedir');
}

/** The user's home directory, or an empty string when it can't be determined. */
export function homeDirectory(): string {
  try {
    const os = nodeRequire()?.('node:os');

    return isOs(os) ? os.homedir() : '';
  } catch {
    return '';
  }
}
