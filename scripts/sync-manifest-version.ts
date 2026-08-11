import manifest from '../manifest.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };
import versions from '../versions.json' with { type: 'json' };

/**
 * Propagate `package.json`'s version into `manifest.json` and `versions.json`.
 *
 * Obsidian reads the version from the manifest, npm reads it from package.json,
 * and the release tag has to match both. Wiring this to the `version` lifecycle
 * script means `bun pm version patch` keeps all three in step instead of
 * leaving a manifest that silently disagrees with the tag.
 *
 * `versions.json` maps each plugin version to the minimum Obsidian version it
 * needs, so users on an older app still get offered a release they can run.
 */
const { version } = pkg;

await Bun.write('manifest.json', `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);

const nextVersions: Record<string, string> = { ...versions, [version]: manifest.minAppVersion };

await Bun.write('versions.json', `${JSON.stringify(nextVersions, null, 2)}\n`);

console.log(`Synced version ${version} (requires Obsidian ${manifest.minAppVersion}).`);
