import manifest from '../manifest.json' with { type: 'json' };

/**
 * Assert the built bundle is shaped the way Obsidian requires.
 *
 * Typecheck, lint, and tests all run against `src/`. None of them look at what
 * the bundler actually emitted, and every property below is a build-config
 * concern that source-level checks cannot see:
 *
 * - Obsidian loads plugins with its own CommonJS loader. An ESM bundle fails at
 *   load time with an error that points at the plugin, not the build.
 * - `obsidian` must stay external. Inlined, the plugin gets a second copy of
 *   the API and misbehaves in ways that are very hard to trace back here.
 * - When `isDesktopOnly` is false, a top-level `require` of a Node or Electron
 *   module takes the plugin down on mobile before any platform guard can run.
 *   That is invisible on a desktop machine, which is where it gets written.
 *
 * Runs in `validate`, so pre-push catches it too — not only CI.
 */
const BUNDLE = 'main.js';

const problems: string[] = [];
const file = Bun.file(BUNDLE);

if (!(await file.exists())) {
  console.error(`${BUNDLE} does not exist. Run \`bun run build\` first.`);
  process.exit(1);
}

const code = await file.text();

if (!code.includes('module.exports')) {
  problems.push(`${BUNDLE} is not CommonJS. Obsidian cannot load an ESM bundle.`);
}

if (!code.includes('require("obsidian")')) {
  problems.push(
    `${BUNDLE} does not require "obsidian" — the API was inlined instead of externalized.`,
  );
}

if (!manifest.isDesktopOnly) {
  // Matches a static `require("electron")` or `require("node:fs")`. The lazy
  // lookup in src/desktop.ts goes through `globalThis.require`, so it is not
  // written this way and does not trip here.
  const forbidden = code.match(/require\("(electron|node:[a-z/]+)"\)/g);

  if (forbidden) {
    problems.push(
      `${BUNDLE} statically requires ${[...new Set(forbidden)].join(', ')}, which crashes on mobile. ` +
        'Either reach it lazily through the global require, or set isDesktopOnly to true.',
    );
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

const kilobytes = Math.round(file.size / 1024);

console.log(`${BUNDLE} looks right: CommonJS, obsidian external, ${kilobytes}KB.`);
