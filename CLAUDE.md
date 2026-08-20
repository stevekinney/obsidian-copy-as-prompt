# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is an **Obsidian plugin**, not a library. Nothing here is published to npm. The deliverable is a single CommonJS `main.js` plus `manifest.json` and `styles.css`, attached to a GitHub release.

## Essential Commands

### Development

```bash
bun run dev               # Watch build; writes to OBSIDIAN_PLUGIN_DIR if set, else ./
bun run build             # Production build → ./main.js
bun run clean             # Remove main.js, coverage, and TS caches
```

Point `OBSIDIAN_PLUGIN_DIR` at `<dev vault>/.obsidian/plugins/copy-as-prompt` and the watch build writes straight into the vault, alongside `manifest.json`, `styles.css`, and a `.hotreload` marker for the Hot-Reload plugin. Never develop against a real vault.

### Testing

```bash
bun test                  # Run all tests
bun test prompt           # Run tests matching a pattern
bun test --watch          # Watch mode
bun test --coverage       # Coverage report
```

### Code Quality

```bash
bun run lint             # oxlint
bun run lint:fix         # oxlint --fix
bun run typecheck        # TypeScript (src + scripts)
bun run typecheck:test   # TypeScript (test files)
bun run format           # Prettier
bun run check            # format:check + lint + typecheck
bun run validate         # check + typecheck:test + test + build
```

## Architecture Overview

### The bundle is the product

`scripts/build.ts` bundles `src/main.ts` into one CommonJS file. Three properties are load-bearing, and CI asserts the first two directly against the built file:

- **Format must be `cjs`.** Obsidian loads plugins with its own CommonJS loader and never reads `package.json`, so `"type": "module"` in this repo says nothing about the output.
- **`obsidian`, `electron`, the CodeMirror/Lezer packages, and Node builtins must stay external.** The app provides them at runtime. Bundling a second copy of `@codemirror/state` breaks the editor in ways that are very hard to trace back to the build config.
- **Target is `browser`.** Plugins run in Electron's renderer on desktop and a WebView on mobile.

Every runtime dependency lands in that bundle and is downloaded by every user. This plugin has zero runtime dependencies, and the settings validation in `src/settings.ts` is hand-rolled for exactly that reason — Zod alone took the bundle from 4KB to 287KB. Adding a dependency is a real decision, not a convenience.

### The pure/impure split

The dividing line is whether a module imports `obsidian`. Modules that do cannot be meaningfully unit tested — a mock deep enough to change that would mostly test the mock — so they stay thin, and the real logic lives in modules that import nothing:

- `prompt.ts` — template substitution, and a code fence that grows past any backtick run in the content so a note full of code blocks can't escape it.
- `edits.ts` — offset-based rewriting. Every transformation is a `{start, end, replacement}` against the _original_ text, applied in one descending pass, so no edit ever sees offsets another has already shifted.
- `cleanup.ts` — comment, Dataview, and Templater removal, as edits rather than string surgery.
- `paths.ts` — absolute/tilde paths, and `@` reference formatting, which double-quotes the path when it contains a space rather than backtick-wrapping it (that would make Claude's `@`-mention parser treat it as inert code).
- `references.ts` — the resolved-link model and how each link renders in each mode.
- `render.ts` — assembling the prompt, including embed recursion.
- `pasteboard.ts` — the macOS file-list property list.
- `images.ts` — which of a note's resolved references are embedded images, from `NoteReference.original` alone.
- `settings.ts` — shape, defaults, and per-field recovery.

`bunfig.toml` excludes the Obsidian-facing modules from coverage and holds the rest at 100%. **When adding a feature, put the logic on the pure side of that line.** If `commands.ts` or `main.ts` is growing branches, that is the signal to extract.

The impure layer's job is to produce plain data: `vault.ts` resolves every link against the metadata cache, decides what each target is, and loads embed bodies to the configured depth — then hands the renderer a structure containing no Obsidian types at all.

### Rewrite by offset, never by regex

Link resolution uses `metadataCache.getFileCache(file)`, which reports links, embeds, and tags with exact character offsets. This is not a stylistic preference:

- Obsidian does not index links inside fenced code blocks, so a `[[Wikilink]]` in a code sample is left alone **for free**. A regex over the raw text would corrupt it.
- The cache distinguishes a `#tag` from a `#heading` and from a `#` in a code span, which is exactly what tag-stripping needs and exactly what a regex gets wrong.
- Multiple replacements of differing lengths on one line stay correct, because nothing is applied until every edit has been collected.

The one regex-driven piece is `cleanup.ts`, because `%%comments%%` and Templater blocks aren't in the cache. It still expresses its results as edits, so it composes with everything else in the same pass.

Frontmatter _links_ are skipped deliberately: `FrontmatterLinkCache` extends `Reference`, not `CacheItem`, so it carries no position and cannot be rewritten by offset. Frontmatter is stripped by default anyway.

### No Bun or Node APIs in `src/`

The template this repo grew from allowed Bun APIs in `scripts/` but not `src/`. That rule is stricter here: `src/` may use neither. `manifest.json` sets `isDesktopOnly: true` — every command already gates on a filesystem path mobile doesn't have, so there is no point pretending otherwise — but Bun's APIs still don't exist inside Obsidian's Electron renderer on any platform, desktop included. Bun APIs remain correct and preferred in `scripts/` and tests.

Node and Electron _are_ reachable on desktop, through `src/desktop.ts` and nothing else. It goes via the global `require` Obsidian exposes, looked up lazily behind `Platform.isDesktopApp`. A static `import { clipboard } from 'electron'` would become a top-level `require` in the bundle and take the plugin down on mobile before any guard could run — so the bundler must never see one. Verify with `grep 'require("electron")' main.js`, which should find nothing.

### Obsidian API conventions

These are the ones the community review actually enforces, and getting them wrong lengthens the review cycle:

- **Clean up on unload.** Anything created must be destroyed. `addCommand`, `addSettingTab`, `registerEvent`, `registerDomEvent`, and `registerInterval` all unregister automatically — prefer them over raw listeners and timers. `main.ts` currently needs no `onunload()` body precisely because everything goes through those.
- **Never build DOM from strings.** No `innerHTML`, `outerHTML`, or `insertAdjacentHTML`. Use `createEl()`, `createDiv()`, `createSpan()`, `setText()`. Note content is untrusted input.
- **`this.app`, never `window.app`.** And `getActiveViewOfType()`, never `workspace.activeLeaf`.
- **Vault API over the adapter.** `getFileByPath()` rather than iterating `getFiles()`; `vault.process()` rather than `vault.modify()` (atomic, survives concurrent edits); `cachedRead()` for read-only access; `normalizePath()` on user-supplied paths.
- **Sentence case in every user-facing string.** "Copy active note as prompt", not "Copy Active Note As Prompt". This covers command names, setting names, and notices.
- **No default hotkeys**, and no top-level heading in the settings tab.
- **Keep `onload()` cheap.** It runs at app startup for every enabled plugin. Defer real work to `workspace.onLayoutReady()`.
- **Style through `styles.css` and Obsidian's CSS variables.** Hardcoded colors look wrong in half the community themes.

`eslint-plugin-obsidianmd` encodes most of these as lint rules, but it depends on `typescript-eslint`, which hard-blocks TypeScript 7 — this repo is on TS 7, so it cannot run here. Revisit when [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940) lands. Until then these conventions are checked by review, not by tooling, so apply them by hand.

## Releasing

Three files must agree on the version: `package.json`, `manifest.json`, and `versions.json`.

```bash
bun run release patch    # or minor, major, or an explicit version
git push --follow-tags
```

`scripts/release.ts` exists specifically because **`bun pm version` tags as `v1.0.0`** and Obsidian matches the release tag against `manifest.json` exactly, with no `v`. It bumps with `--no-git-tag-version` (which still fires the `version` lifecycle script, and therefore still syncs `manifest.json` and `versions.json`), then tags in the correct form. It refuses to run on a dirty tree and verifies the manifest actually moved before tagging.

Pushing the tag triggers `.github/workflows/release.yaml`, which verifies consistency, runs the gate, attests build provenance, and creates a release with `main.js`, `manifest.json`, and `styles.css`.

Two things will cost a release cycle if forgotten:

- **Tags carry no `v` prefix.** `v1.0.0` produces a release nobody can install, and nothing fails until a user tries. The workflow matches the `v` form anyway — deliberately — so `scripts/verify-release-version.ts` can fail loudly in the first step instead of the tag silently triggering nothing.
- **A version can only be released once.** A botched release means bumping the version, not retagging.

`versions.json` maps each plugin version to its `minAppVersion`, which is how users on an older Obsidian still get offered a release they can run. Bump `minAppVersion` in `manifest.json` when you start using a newer API, and the sync script records the mapping.

## Git Hooks Architecture

Hooks are configured in `lefthook.yml` and implemented as Bun TypeScript files under `scripts/hooks/`:

- **pre-commit** (piped/sequential): formats staged files with Prettier, runs oxlint --fix on staged files, blocks staged conflict markers, and checks `bun.lock` is staged when `package.json` changes. Fast by design; skipped during merge/rebase.
- **pre-push**: runs full `bun run validate`; skipped in CI.
- **post-checkout** (`scripts/hooks/post-checkout.ts`): installs deps when `bun.lock` changes; surfaces config changes. Silent when nothing actionable changed.
- **post-merge** (`scripts/hooks/post-merge.ts`): installs/cleans when dependencies or config changed; flags leftover conflict markers. Silent when nothing actionable changed.

Hooks print only on failure (`output: [failure, execution_out]`), so a clean commit/push stays quiet.

## Claude Code Hooks

`.claude/settings.json` wires up two project-level hooks (scripts in `.claude/hooks/`):

- **format-on-edit** (`PostToolUse` on `Edit`/`Write`): runs `prettier --write --ignore-unknown` on the edited file. Note that this reformats Markdown too, and Prettier will mangle a nested code fence in a `.md` file if the outer fence is not longer than the inner one.
- **protect-env** (`PreToolUse` on `Write`): blocks writes to `.env` / `.env.*`.

## Development Patterns

### Adding a feature

Decide first whether it is logic or wiring. Logic goes in `src/prompt.ts` or a new pure module next to it, with tests. Wiring — a command, a setting, a notice — goes in `main.ts` or `settings-tab.ts` and stays as thin as possible.

Adding a setting means four edits: the type and default in `src/settings.ts`, a branch in `parseSettings` (with a test for the recovery path), a `Setting` row in `src/settings-tab.ts`, and use of the value wherever it applies.

### Testing Approach

- Bun's built-in test runner with `describe`, `it`, `expect`.
- Test files are colocated with sources using the `.test.ts` suffix.
- `test/setup.ts` is preloaded by `bunfig.toml`; it resets mocks and system time in `afterEach`.
- Oxlint and `tsconfig.test.json` relax rules for test files.
- Coverage is 100% for everything not excluded in `bunfig.toml`. Do not add files to `coveragePathIgnorePatterns` to dodge a test — the only entries there are the two modules that cannot run outside Obsidian.

### Import Organization

1. Node built-ins (`node:` prefixed) — `scripts/` only
2. External packages (`obsidian`)
3. Relative imports, with `.js` extensions

No path alias — relative imports everywhere.

## Bun-Specific Considerations

- Always use `bun`, not `npm` or `yarn`. The lockfile is `bun.lock`.
- Prefer Bun built-ins in `scripts/` and tests: `Bun.file(path).text()`, `Bun.write()`, `Bun.$`, `Bun.Glob`, `Bun.env`. Never in `src/` — see above.
- For one-off package execution use `bun x` (resolves from `devDependencies`) rather than `bunx`.
- `bunfig.toml` configures the `.md` text loader, forces the Bun runtime for scripts, and sets test preload, coverage reporters, exclusions, and thresholds.
