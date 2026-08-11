import { $ } from 'bun';

import manifest from '../manifest.json' with { type: 'json' };

/**
 * Bump the version and tag the release.
 *
 * This exists because `bun pm version patch` tags as `v0.0.2`, and Obsidian
 * matches the release tag against `manifest.json` exactly — with no `v`. That
 * tag produces a release nobody can install, and nothing fails until a user
 * tries. So the bump runs with `--no-git-tag-version`, and the tag is created
 * here in the form Obsidian actually wants.
 *
 * The bump still fires the `version` lifecycle script, which is what syncs
 * `manifest.json` and `versions.json` to the new number.
 *
 * Usage: `bun run release patch` (or minor, major, or an explicit version).
 */
const increment = Bun.argv[2] ?? 'patch';

const status = await $`git status --porcelain`.text();

if (status.trim()) {
  console.error('Working tree is not clean. Commit or stash first.');
  process.exit(1);
}

await $`bun pm version ${increment} --no-git-tag-version`;

/** Read a `version` field from a JSON file on disk, without trusting its shape. */
async function versionOf(path: string): Promise<string> {
  const parsed: unknown = await Bun.file(path).json();

  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) return '';

  return typeof parsed.version === 'string' ? parsed.version : '';
}

// Re-read from disk: the lifecycle script has rewritten these by now.
const version = await versionOf('package.json');
const manifestVersion = await versionOf('manifest.json');

if (manifestVersion !== version) {
  console.error(
    `manifest.json is at ${manifestVersion} but package.json is at ${version}. The version script did not run.`,
  );
  process.exit(1);
}

await $`git add package.json manifest.json versions.json`;
await $`git commit -m ${version}`;
await $`git tag -a ${version} -m ${version}`;

console.log(`Tagged ${version} (requires Obsidian ${manifest.minAppVersion}).`);
console.log('Push it with: git push --follow-tags');
