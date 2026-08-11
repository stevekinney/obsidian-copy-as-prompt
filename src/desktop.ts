import { Platform } from 'obsidian';

/**
 * Reaching Node and Electron from inside Obsidian, safely.
 *
 * `manifest.json` says `isDesktopOnly: false`, which is a promise that this
 * plugin loads on iOS and Android. That promise is kept by never importing
 * `node:*` or `electron` at module scope: a static import becomes a top-level
 * `require` in the bundle and takes the whole plugin down on mobile before any
 * guard can run. Everything here goes through the global `require` Obsidian
 * exposes on desktop, looked up lazily and behind a platform check, so the
 * bundler never records a dependency at all.
 *
 * Callers must treat every return value here as optional. On mobile they are
 * all null, and the features built on them are gated off rather than broken.
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

function isElectron(value: unknown): value is { clipboard: ElectronClipboard } {
  return (
    typeof value === 'object' &&
    value !== null &&
    hasFunction(Reflect.get(value, 'clipboard'), 'writeBuffer')
  );
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

/** Electron's clipboard module, or null when it isn't reachable. */
export function electronClipboard(): ElectronClipboard | null {
  return load('electron', isElectron)?.clipboard ?? null;
}

/** Encode a string as a UTF-8 buffer Electron will accept. */
export function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** Whether the file-list clipboard path is even worth attempting. */
export function supportsFileClipboard(): boolean {
  return Platform.isDesktopApp && Platform.isMacOS && electronClipboard() !== null;
}
