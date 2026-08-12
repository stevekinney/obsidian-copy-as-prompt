# Copy as Prompt

An [Obsidian](https://obsidian.md) plugin that turns a note into a prompt — resolving its wikilinks into real file paths, so the model you paste it into can go read the rest for itself.

## What it does

A note that says `See [[Design]] for the limits` isn't much use pasted into a chat window: the model has no idea what `[[Design]]` is. This plugin rewrites it into something actionable, in one of two shapes.

**Paths mode** targets Claude Code in a terminal. Every link becomes an `@` path:

```text
See @~/Vaults/notes/Work/Design.md for the limits.
```

Claude Code opens those files on demand, so the clipboard payload stays small no matter how much your notes link to. Paths with spaces are backtick-wrapped — `` `@~/Vaults/Kubernetes notes.md` `` — because bare, they parse as a path plus a stray word.

> [!NOTE] Claude Code only reads inside its working directory
> If you run it somewhere other than the vault, `/add-dir ~/Vaults` first, or switch **Path style** to vault-relative and run it from the vault root.

**Self-contained mode** targets a browser chat, where a path is a dead reference. Links collapse to their display text, `![[embeds]]` are inlined as fenced sections to a configurable depth, and images become named placeholders plus a manifest of what to attach.

### What happens to each kind of link

| In the note                      | Paths mode                           | Self-contained           |
| -------------------------------- | ------------------------------------ | ------------------------ |
| `[[Design]]`                     | `@~/…/Design.md`                     | `Design`                 |
| `[[Design\|the contract]]`       | `@~/…/Design.md`                     | `the contract`           |
| `[[Design#Rate limits]]`         | `@~/…/Design.md (see "Rate limits")` | `Design`                 |
| `![[Design]]`                    | `@~/…/Design.md`                     | the note's text, inlined |
| `![[diagram.png]]`               | `@~/…/diagram.png`                   | `[image: diagram.png]`   |
| `[[Note never written]]`         | unchanged                            | unchanged                |
| `[[Design]]` inside a code fence | unchanged                            | unchanged                |

Unresolved links keep their `[[brackets]]` on purpose: emitting a path for a file that doesn't exist sends the model chasing something that isn't there.

### Images

In paths mode images are just more `@` paths — Claude Code reads image files natively. In self-contained mode they can't be inlined, so **Copy referenced images** puts the image _files_ on the clipboard and one paste attaches all of them at once. That uses a macOS pasteboard type Electron doesn't officially support for this, so the write is read back and verified; when it fails, or you're not on macOS, the command falls back to copying one image per run and tells you where it's up to.

### What gets removed

Frontmatter, `#tags`, `%%Obsidian comments%%`, and Dataview/Templater blocks are stripped by default, each independently toggleable. Comments matter most: they're private by convention and never render, so they're easy to forget about until one is already in a chat window.

Tags and frontmatter are removed using Obsidian's metadata cache rather than pattern matching, so a `#` in a heading or a code span is never mistaken for a tag.

### Where you can run it

Six commands (active note and selection, in each mode; path only; referenced images), plus right-click entries on a note, a multi-file selection, a folder, and an editor selection. Copying a folder concatenates every note in it, and asks first above a configurable count — it's one keystroke from a 500-note clipboard.

Paths-mode commands hide themselves on mobile, where there's no filesystem path to emit. Self-contained mode works everywhere.

## Installing

Until this is in the community directory, install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat), which installs and auto-updates plugins straight from a GitHub repository:

1. Install **BRAT** from Settings → Community plugins.
2. Run **BRAT: Add a beta plugin for testing** from the command palette.
3. Paste this repository's URL.

BRAT reads `manifest.json` from the repo root and pulls `main.js`, `manifest.json`, and `styles.css` from the latest release, then keeps them updated.

To install by hand instead, download those three files from the [latest release](../../releases/latest) into `<vault>/.obsidian/plugins/copy-as-prompt/` and enable the plugin.

## Development

You need [Bun](https://bun.sh). Install dependencies with `bun install`.

### Set up a development vault

Never develop against your real vault — a plugin under active development can and will corrupt notes. Make an empty vault for this, then point the build at it:

```bash
export OBSIDIAN_PLUGIN_DIR="$HOME/Vaults/dev/.obsidian/plugins/copy-as-prompt"
bun run dev
```

The watch build writes `main.js`, `manifest.json`, `styles.css`, and a `.hotreload` marker straight into that folder. Install [Hot-Reload](https://github.com/pjeby/hot-reload) in the dev vault and saves reload the plugin automatically; without it, toggle the plugin off and on in **Settings → Community plugins**.

Leave `OBSIDIAN_PLUGIN_DIR` unset and the build writes to the repo root, which is what `bun run build` does for a release.

### Commands

```bash
bun run dev          # watch build (honours OBSIDIAN_PLUGIN_DIR)
bun run build        # production build → ./main.js
bun test             # run tests
bun run check        # format check + lint + typecheck
bun run verify:bundle # assert the built main.js is shaped right
bun run validate     # the full gate; also what pre-push runs
```

### How the code is laid out

The dividing line is whether a module imports `obsidian`. Those that don't are pure and hold 100% test coverage; those that do are kept as thin as possible.

Pure, tested:

- `prompt.ts` — template substitution and the code fence that content can't escape.
- `edits.ts` — offset-based rewriting, applied in a single pass.
- `cleanup.ts` — comment, Dataview, and Templater removal.
- `paths.ts` — absolute/tilde paths and `@` reference formatting.
- `references.ts` — the resolved-link model and how each link renders.
- `render.ts` — assembling the final prompt in either mode.
- `pasteboard.ts` — the macOS file-list property list.
- `settings.ts` — shape, defaults, and per-field recovery.

Obsidian-facing, excluded from coverage:

- `vault.ts` — resolves links against the vault and loads embed bodies.
- `commands.ts` — resolve, render, write, report.
- `clipboard.ts`, `desktop.ts` — clipboard and the lazy Node/Electron boundary.
- `main.ts`, `settings-tab.ts`, `confirm-modal.ts` — registration and UI.

The interesting consequence: because links are rewritten by _character offset_ from Obsidian's metadata cache rather than by regex over the text, a `[[Wikilink]]` inside a fenced code block is left alone for free — the cache never indexed it. Keep new logic on the pure side of that line.

### What the bundle has to look like

`main.js` is a single CommonJS file. Obsidian loads it with its own loader and never reads `package.json`, so `"type": "module"` here is irrelevant to the output. `obsidian`, `electron`, the CodeMirror packages, and the Node builtins are all external. CI asserts both properties on the built file.

Node and Electron are reached through the global `require` at call time, never a static import — `manifest.json` says `isDesktopOnly: false`, and a top-level `require('electron')` would break the plugin on mobile before any platform guard could run.

Every runtime dependency ends up in that bundle and gets downloaded by every user. This plugin has none.

## Releasing

Versions live in three places that must agree: `package.json`, `manifest.json`, and `versions.json`.

```bash
bun run release patch    # or minor, major, or an explicit version
git push --follow-tags
```

> [!WARNING] Do not use `bun pm version`
> It tags as `v1.0.0`, and Obsidian matches the release tag against `manifest.json` exactly — with no `v`. That tag produces a release nobody can install, and nothing fails until a user tries. `bun run release` bumps the version, syncs `manifest.json` and `versions.json`, and tags in the form Obsidian wants. If a `v`-prefixed tag is pushed anyway, the workflow still runs and fails immediately with an explanation rather than silently doing nothing.

Pushing the tag triggers `.github/workflows/release.yaml`, which verifies all three versions agree, runs the full gate, attests build provenance, and creates a GitHub release with `main.js`, `manifest.json`, and `styles.css` attached.

Republishing a version is not possible, so a botched release costs a version bump rather than a retag.

## Submitting to the community directory

The repository root needs `manifest.json`, `README.md`, and `LICENSE` on the default branch, plus a release whose tag matches the manifest version with the three assets attached. Then sign in at [community.obsidian.md](https://community.obsidian.md), link your GitHub account, and add the plugin. An automated review runs against [Obsidian's plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines); addressing its feedback means publishing a new release with an incremented version.

## License

MIT. See [LICENSE](./LICENSE).
