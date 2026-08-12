import { Platform } from 'obsidian';

/**
 * Reaching Node and Electron from inside Obsidian, safely.
 *
 * The plugin is `isDesktopOnly`, so this could be a static import. It stays
 * lazy anyway: a top-level `require('node:os')` or `require('electron')`
 * executes when the bundle loads, and a failure there takes the whole plugin
 * down before any of it can report why. Behind a platform check, the worst
 * case is a missing `~` or a clipboard feature that quietly declines.
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

/**
 * Require a module, returning it only if it looks like what we expect.
 *
 * A runtime `require` leaves the type system entirely, so the guard is what
 * actually establishes the shape — a hand-written predicate rather than an
 * assertion, so the runtime check and the type claim cannot drift apart.
 */
function load<T>(id: string, guard: (value: unknown) => value is T): T | null {
  try {
    const module = nodeRequire()?.(id);

    return guard(module) ? module : null;
  } catch {
    return null;
  }
}

function isOs(value: unknown): value is { homedir(): string } {
  return hasFunction(value, 'homedir');
}

/** The user's home directory, or an empty string when it can't be determined. */
export function homeDirectory(): string {
  const os = load('node:os', isOs);

  try {
    return os?.homedir() ?? '';
  } catch {
    return '';
  }
}

/** The subset of Electron's clipboard this plugin uses. */
export type ElectronClipboard = {
  writeBuffer(format: string, buffer: Uint8Array): void;
  readBuffer(format: string): Uint8Array;
};

function isElectron(value: unknown): value is { clipboard: ElectronClipboard } {
  return (
    typeof value === 'object' &&
    value !== null &&
    hasFunction(Reflect.get(value, 'clipboard'), 'writeBuffer')
  );
}

/** Electron's clipboard module, or null when it isn't reachable. */
export function electronClipboard(): ElectronClipboard | null {
  return load('electron', isElectron)?.clipboard ?? null;
}

/** Encode a string as a UTF-8 buffer Electron will accept. */
export function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/**
 * Whether the file-list clipboard path is even worth attempting.
 *
 * `NSFilenamesPboardType` is a macOS pasteboard concept; Windows and Linux
 * have their own equivalents this plugin does not (yet) speak, so those
 * platforms fall back to copying one image at a time instead.
 */
export function supportsFileClipboard(): boolean {
  return Platform.isDesktopApp && Platform.isMacOS && electronClipboard() !== null;
}
