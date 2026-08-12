import { Platform } from 'obsidian';

/**
 * Reaching Node from inside Obsidian, safely.
 *
 * The plugin is `isDesktopOnly`, so this could be a static import. It stays
 * lazy anyway: a top-level `require('node:os')` executes when the bundle
 * loads, and a failure there takes the whole plugin down before any of it can
 * report why. Behind a platform check, the worst case is a missing `~`.
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
