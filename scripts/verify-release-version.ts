import manifest from '../manifest.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };
import versions from '../versions.json' with { type: 'json' };

/**
 * Guard the three things a release has to agree on.
 *
 * Obsidian matches the release tag against `manifest.json` exactly — and
 * unlike npm convention, the tag carries **no `v` prefix**. A `v1.0.0` tag
 * produces a release users cannot install, and the failure is invisible until
 * someone tries. Publishing the same version twice is also rejected, so a
 * botched release costs a version bump rather than a retag.
 */
const tag = Bun.env['GITHUB_REF_NAME'] ?? Bun.argv[2];

if (!tag) {
  console.error('No tag given. Pass one as an argument or set GITHUB_REF_NAME.');
  process.exit(1);
}

const problems: string[] = [];

if (tag.startsWith('v')) {
  problems.push(
    `Tag "${tag}" starts with "v". Obsidian tags must be bare, e.g. ${manifest.version}.`,
  );
}

if (tag !== manifest.version) {
  problems.push(`Tag "${tag}" does not match manifest.json version "${manifest.version}".`);
}

if (pkg.version !== manifest.version) {
  problems.push(
    `package.json version "${pkg.version}" does not match manifest.json version "${manifest.version}". Run "bun run scripts/sync-manifest-version.ts".`,
  );
}

if (!(manifest.version in versions)) {
  problems.push(`versions.json has no entry for "${manifest.version}".`);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

console.log(`Release ${tag} is consistent across manifest.json, package.json, and versions.json.`);
