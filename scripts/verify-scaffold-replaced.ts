import pkg from '../package.json' with { type: 'json' };

/**
 * Fail while the scaffold's placeholder content is still in place.
 *
 * A template exists to be overwritten, and the one thing nobody notices they
 * skipped is the README — it is not imported, not type-checked, and not
 * tested, so the first signal that it was never replaced is boilerplate
 * sitting on the package's npm page.
 *
 * Unlike the packed-types check, this is deliberately a static grep: the
 * failure mode is "nobody edited the file," which a marker catches exactly.
 */

type Manifest = {
  readonly name?: string;
  readonly description?: string;
  readonly 'bun-create'?: unknown;
};

const manifest = pkg as Manifest;

// The template itself is *supposed* to be placeholder content, so this check
// has to exempt it or the template's own `validate` can never pass.
// `scripts/postinstall-cleanup.ts` strips the `bun-create` key from generated
// projects, which makes its presence an exact marker for "still the template."
if (manifest['bun-create'] !== undefined) {
  console.log('Skipping scaffold check: this is the template itself.');
  process.exit(0);
}

const problems: string[] = [];

const readme = await Bun.file('./README.md').text();
if (/^#\s+Project Name\s*$/mu.test(readme)) {
  problems.push('README.md still has the scaffold title "# Project Name".');
}

if (manifest.name === undefined || manifest.name === 'project-name') {
  problems.push('package.json "name" is still the scaffold placeholder.');
}

if (manifest.description === undefined || manifest.description.length === 0) {
  problems.push('package.json "description" is empty.');
}

if (problems.length > 0) {
  console.error('This package still contains scaffold placeholder content:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    '\nReplace it before publishing. These files ship to npm exactly as they are here.',
  );
  process.exit(1);
}

console.log('Scaffold placeholders replaced.');
