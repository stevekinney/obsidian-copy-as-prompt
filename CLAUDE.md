# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development

```bash
bun run dev               # Start development with watch mode
bun run build             # Build for production (outputs to dist/)
bun ./dist/bun/index.js   # Run Bun-optimized build
node ./dist/node/index.js # Run Node-compatible build
```

### Testing

```bash
bun test                  # Run all tests
bun test src/utils        # Run tests in specific directory
bun test logger           # Run tests matching pattern
bun test --watch          # Watch mode
bun test --coverage       # Generate coverage report
```

### Code Quality

```bash
bun run lint             # Check linting errors
bun run lint:fix         # Auto-fix linting errors
bun run typecheck        # TypeScript type checking (src + scripts)
bun run typecheck:test   # TypeScript type checking (test files)
bun run format           # Format all files with Prettier
bun run format:check     # Check formatting without changes
bun run check            # Fast local sanity: format:check + lint + typecheck
bun run validate         # Full gate: check + typecheck:test + test + build + package:check + verify:package-types + verify:scaffold
```

### Utilities

```bash
bun run clean                # Clean build artifacts (dist/, coverage/, caches)
bun run package:check        # Run publint + @arethetypeswrong/cli on packed tarball
bun run verify:package-types # Install the packed tarball and type-check it as a consumer
bun run verify:scaffold      # Fail while template placeholder content remains
```

## Architecture Overview

### Core Design Principles

1. **Environment-First Configuration**: All configuration starts with environment variables validated through Zod schemas in `src/environment.ts`. The `environment` object is the single source of truth.

2. **Lean Surface Area**: This template intentionally avoids framework-specific scaffolding (custom error classes, logger wrappers, etc.). Add only what you need for your project.

3. **Runtime-Neutral Published Code**: `src/` must not use Bun-only runtime APIs (`Bun.file`, `Bun.env`, `Bun.serve`, etc.). Those APIs are fine in `scripts/` and test files, but must not appear in published library output.

### Key Notes

- **ESM + TypeScript**: Source files are TypeScript modules; build output targets both Node and Bun.
- **Import paths**: Use standard TS/ESM imports; no `@/*` path alias (it leaks into `.d.ts` files).
- **Library output**: Dual-emit — `dist/node/` for Node consumers, `dist/bun/` for Bun consumers. The `exports` map routes consumers automatically.

### Library Packaging

The build produces:

- `dist/node/index.js` — ESM bundle, `Bun.build target: 'node'`, all deps external
- `dist/bun/index.js` — ESM bundle, `Bun.build target: 'bun'`, all deps external
- `dist/index.d.ts` — TypeScript declarations (shared)

The `exports` map in `package.json`:

```json
{
  ".": {
    "types": "./dist/index.d.ts",
    "bun": "./dist/bun/index.js",
    "import": "./dist/node/index.js",
    "default": "./dist/node/index.js"
  },
  "./package.json": "./package.json"
}
```

Package validation runs as part of `validate`: `publint` checks the exports map structure and `@arethetypeswrong/cli` checks type resolution across resolution modes.

**Neither of those proves the published types are usable.** They verify that each export condition _resolves_ — not that the declarations it resolves to mean anything. A real package shipped a `dist/types.d.ts` that re-exported from itself; `publint` and `attw` both reported "No problems found" while every consumer got `TS2303: Circular definition of import alias` and no public type materialized. The failure was invisible in-repo, because internal imports resolve against `src/`, and only appeared once somebody installed the tarball.

So `scripts/verify-package-types.ts` packs the tarball, installs it into a throwaway directory, and type-checks a generated fixture that imports every typed export subpath with `skipLibCheck: false`. That flag is the point: it checks the shipped declarations instead of trusting them. The script reads the `exports` map, so it keeps covering new subpaths without being edited.

This costs a pack, an install, and a compile on every `validate`. That is a real cost, accepted deliberately — it is the only check in the gate that fails when the published types are broken. If you are tempted to replace it with a faster static scan of the `.d.ts` files, note that `attw` _is_ a static check, and it is the one that missed this.

That check now also **imports** each entry from the installed tarball, not just type-checks it. Correct declarations do not mean the JavaScript loads: with `sideEffects: false` in package.json, Bun tree-shakes the body of a pure re-export barrel and emits an `index.js` that is nothing but `export { … }` — no imports, no definitions. The `.d.ts` files stay perfect and `publint`, `attw`, and `tsc` all pass, while every consumer gets `SyntaxError: Export 'X' is not defined in module`. If your `src/index.ts` is only re-exports, either drop `sideEffects: false` or confirm the built entry actually imports something. Note also that `sideEffects: false` is a claim about the package: it is false the moment any module does work at import time, such as resolving configuration.

`scripts/verify-scaffold-replaced.ts` is the opposite trade: a plain grep, because "nobody replaced the README" is exactly what a grep catches. The README is not imported, type-checked, or tested, so without this the first signal it was never rewritten is boilerplate on the package's npm page — which has also actually happened.

### Publishing to npm

`.github/workflows/release.yaml` publishes on a `v*.*.*` tag using npm trusted publishing (OIDC) with provenance — no token to store or rotate. Three things have each cost a real release cycle, and none of them fail until the very last step of a run where everything else already passed:

- **The trusted-publisher registration on npmjs.com must name the workflow file exactly**, `release.yaml` — registering `release.yml` fails with a `404 … or you do not have permission` on `PUT`, which reads like a missing package rather than an identity mismatch. Leave the environment field empty unless the workflow declares one.
- **`bin` paths must not start with `./`.** npm 11 silently rewrites `"./dist/node/index.js"` to `"dist/node/index.js"` at publish time and warns that it "removed" the entry; `publint`, `attw`, and the packed-types check all pass, and you find out when `npx your-package` cannot find the binary. Write bin paths bare.
- **Set `repository`, `homepage`, and `bugs`** before the first publish. Nothing in the gate requires them, and their absence is only visible as a bare npm page.
- **`attw --pack` shells out to a hardcoded `npm pack`, which breaks when nested inside an active `npm publish`.** `npm publish` runs the `prepublishOnly` script (`bun run validate`, which includes `package:check`) _inside its own npm process_; a second `npm pack` invoked from there fails silently, and `attw` then reports a baffling `ENOENT: ... open '<name>-<version>.tgz'` instead of the real cause. `scripts/check-package.ts` packs with `bun pm pack` (no such issue) and hands the tarball to `attw` directly, so `package:check` never triggers this. If you ever see that `ENOENT` again, it means something reintroduced `attw --pack`.
- **`prepare` must resolve `lefthook` without relying on `$PATH`.** The same nested-npm-process problem strips `node_modules/.bin` from `PATH` in some lifecycle contexts, so a bare `"prepare": "lefthook install"` intermittently fails with `lefthook: command not found` during exactly this nested-pack scenario. `"prepare": "bun x lefthook install"` resolves it from `node_modules` directly regardless of `PATH`.
- **`prepublishOnly` runs the gate under a TTY, which CI never does.** `npm publish` is typically run interactively, so any test whose output depends on terminal detection behaves differently there than everywhere you validated it. Colour is the usual culprit: chalk emits ANSI codes to a terminal and plain text to a pipe, so an assertion like `toContain('demo — ok')` passes in CI (logs are not a TTY) and fails at publish time. `test/setup.ts` pins `chalk.level = 0` to remove the dependency; keep it. To reproduce a TTY locally, wrap the command: `script -q /dev/null bun run validate`.

- **Scoped packages need `publishConfig.access = "public"`.** Scoped names default to restricted, so npm rejects the publish with `E402 Payment Required — You must sign up for private packages`, which reads like a billing problem rather than a missing field. Keep `provenance` out of `publishConfig` — it only works from CI and would break a local bootstrap publish.
- **`npm publish --dry-run` proves almost nothing.** It never performs the registry `PUT`, so access level, authentication, version conflicts, and 2FA are all invisible to it. `scripts/preflight-publish.ts` checks those directly and runs first in `prepublishOnly`, failing in a second rather than after the whole gate.

Publishing the same version twice is rejected, so a botched release means bumping the version rather than retrying the tag.

Because the gate runs a second time inside `npm publish` — the release workflow already runs lint, typecheck, test, build, and `package:check` as separate steps — anything environment-sensitive gets two chances to break a release. Prefer narrowing `prepublishOnly` over adding retries.

### Git Hooks Architecture

Hooks are configured in `lefthook.yml` and implemented as Bun TypeScript files under `scripts/hooks/`:

- **pre-commit** (`lefthook.yml`, piped/sequential): formats staged files with Prettier, runs oxlint --fix on staged files, blocks staged conflict markers, and checks `bun.lock` is staged when `package.json` changes. Fast by design; skipped during merge/rebase.
- **pre-push** (`lefthook.yml`): runs full `bun run validate`; skipped in CI.
- **post-checkout** (`scripts/hooks/post-checkout.ts`): installs deps when `bun.lock` changes; surfaces config changes. Silent when nothing actionable changed.
- **post-merge** (`scripts/hooks/post-merge.ts`): installs/cleans when dependencies or config changed; flags leftover conflict markers. Silent when nothing actionable changed.

Hooks print only on failure (`output: [failure, execution_out]` in `lefthook.yml`), so a clean commit/push stays quiet. The TypeScript hook scripts use `chalk` for color, `change-case` for headings, and Bun's `$` and `Bun.write` for shell/IO.

### Claude Code Hooks

`.claude/settings.json` wires up two project-level Claude Code hooks (scripts in `.claude/hooks/`):

- **format-on-edit** (`PostToolUse` on `Edit`/`Write`): runs `prettier --write --ignore-unknown` on the file Claude just edited, so edits always match the project style and never trip the format gate. Fail-safe — no-ops if Prettier isn't installed yet.
- **protect-env** (`PreToolUse` on `Write`): blocks writes to `.env` / `.env.*` (except `.env.example`) so secrets aren't clobbered. Edit those files manually.

Both scripts exit 0 (no-op) when their dependencies are missing, so a freshly cloned template never breaks a session.

### Types

There is no shared `src/types.ts` in this template. Add shared or domain-specific types near their modules as needed.

## Development Patterns

### Adding New Features

1. **Environment variables**: Add to `.env.example` first, then update the schema in `src/environment.ts`.
2. **Types**: Domain-specific types live near their modules.

### Testing Approach

- Tests use Bun's built-in test runner with `describe`, `it`, `expect`.
- Test files are colocated with sources using the `.test.ts` suffix.
- `test/setup.ts` is preloaded by `bunfig.toml` — it resets mocks and system time in `afterEach`. All tests get this automatically.
- Oxlint rules are relaxed for test files. You can use `any`, non-null assertions, and other patterns normally flagged.
- A separate `tsconfig.test.json` provides relaxed TypeScript settings for tests (checked by `bun run typecheck:test`).
- Coverage threshold is 100% for `src/`. Run `bun test --coverage` to see the report.

### Import Organization

Keep imports in this order:

1. Bun built-ins (e.g., `import { file, write } from 'bun'`)
2. Node built-ins (e.g., `import { readFile } from 'node:fs'`)
3. External packages (e.g., `import { z } from 'zod'`)
4. Relative imports (e.g., `./local-module`)

No path alias (`@/*`) — use relative imports everywhere.

## Bun-Specific Considerations

- Always use `bun` commands, not `npm` or `yarn`.
- The lockfile in this repo is `bun.lock`.
- Bun provides native TypeScript execution without precompilation.
- For one-off package execution, use `bun x` for packages already in `devDependencies` rather than `bunx`, which can pull remote versions.

### Prefer Bun Built-ins Over Node

When possible, use Bun's native APIs in `scripts/` and tests. Do not use them in `src/` — published code must be Node-compatible.

| Task          | Use (Bun)                                | Avoid (Node)                     |
| ------------- | ---------------------------------------- | -------------------------------- |
| Read file     | `Bun.file(path).text()`                  | `fs.readFileSync(path, 'utf-8')` |
| Write file    | `Bun.write(path, data)`                  | `fs.writeFileSync(path, data)`   |
| HTTP server   | `Bun.serve()`                            | `http.createServer()` or Express |
| Hashing       | `Bun.hash()` or `new Bun.CryptoHasher()` | `crypto.createHash()`            |
| Spawn process | `Bun.spawn()` or `Bun.$`                 | `child_process.spawn()`          |
| Sleep         | `Bun.sleep(ms)`                          | `setTimeout` with promisify      |
| Environment   | `Bun.env.VAR`                            | `process.env.VAR`                |
| Glob          | `Bun.Glob`                               | `glob` package                   |

When a Bun equivalent doesn't exist or Node's API is more appropriate, use the `node:` prefix for clarity (e.g., `import { join } from 'node:path'`).

### Configuration Notes

- **bunfig.toml**: Configures the `.md` text loader, forces Bun runtime for scripts, and sets up `bun test` with preload, coverage, and 100% thresholds.
- **TypeScript**: Uses Bun types; Node type libs are not included by default.
- **Oxlint**: Rust-based linter with built-in TypeScript, promise, unicorn, and import plugins. Type-aware rules enabled via `--type-aware --tsconfig ./tsconfig.json`. Test files have relaxed rules.
- **Testing**: Run tests in parallel via `bun test --parallel`.
