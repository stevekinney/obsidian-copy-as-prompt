import { Notice, TFile, type App, type Editor, type MarkdownFileInfo } from 'obsidian';

import { buildCommand, flagsFrom } from './cli.js';
import { writeFiles, writeImage, writeText, type FileClipboardResult } from './clipboard.js';
import { describe, measure } from './estimate.js';
import type { ExclusionRules } from './exclusions.js';
import { parseList } from './list-field.js';
import { displayPath, reference } from './paths.js';
import { PreviewModal } from './preview-modal.js';
import { sliceBody } from './references.js';
import { render, type ImageRef, type RenderableNote, type RenderMode } from './render.js';
import type { PluginSettings } from './settings.js';
import {
  isFileExcluded,
  resolveCanvas,
  resolveNote,
  resolveRelated,
  vaultContext,
  type ResolveOptions,
  type VaultContext,
} from './vault.js';

/**
 * The operations behind the commands.
 *
 * `main.ts` decides *when* these run; this decides what they do. Splitting them
 * keeps command registration readable and keeps the orchestration — resolve,
 * render, review, write, report — in one place per operation.
 */

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

/** How long an explanatory notice stays up, in milliseconds. */
const EXPLANATION_MS = 10_000;

/** Where the cycling image fallback has got to. */
type ImageQueue = {
  key: string;
  images: ImageRef[];
  index: number;
};

export class PromptCopier {
  private queue: ImageQueue | null = null;

  constructor(
    private readonly app: App,
    private readonly settings: () => PluginSettings,
  ) {}

  /** Whether real filesystem paths are available. False on mobile. */
  canUsePaths(): boolean {
    return vaultContext(this.app) !== null;
  }

  /** Copy one or more whole notes, following links as far as configured. */
  async copyNotes(files: readonly TFile[], mode: RenderMode): Promise<void> {
    const options = this.resolveOptions(mode);

    if (!options) return;

    const allowed = files.filter((file) => !isFileExcluded(this.app, file, options.exclusions));

    if (allowed.length === 0) {
      new Notice('Every selected note is excluded by your rules');

      return;
    }

    if (allowed.length < files.length) {
      new Notice(`Skipped ${files.length - allowed.length} excluded of ${files.length}`);
    }

    const notes = await Promise.all(allowed.map((file) => resolveNote(this.app, file, options)));
    const related = await resolveRelated(this.app, allowed, options);

    await this.deliver([...notes, ...related], mode);
  }

  /** Copy a canvas: its text nodes as prose, its file nodes as context. */
  async copyCanvas(file: TFile, mode: RenderMode): Promise<void> {
    const options = this.resolveOptions(mode);

    if (!options) return;

    const note = await resolveCanvas(this.app, file, options);

    if (note.body.content.length === 0) {
      new Notice('This canvas has nothing to copy');

      return;
    }

    await this.deliver([note], mode);
  }

  /** Copy just the selected text, with its links resolved. */
  async copySelection(editor: Editor, context: MarkdownFileInfo, mode: RenderMode): Promise<void> {
    const file = context.file;
    const options = this.resolveOptions(mode);

    if (!file || !options) return;

    const note = await resolveNote(this.app, file, options);
    const from = editor.posToOffset(editor.getCursor('from'));
    const to = editor.posToOffset(editor.getCursor('to'));

    await this.deliver([{ ...note, body: sliceBody(note.body, from, to) }], mode);
  }

  /** Copy the note's `@path` and nothing else. */
  async copyPath(file: TFile): Promise<void> {
    const context = vaultContext(this.app);

    if (!context) {
      new Notice('Paths are only available in the desktop app');

      return;
    }

    // Through pathContext, so the override applies here as well — otherwise
    // this one command would quietly emit a different path from every other.
    const path = displayPath(file.path, this.pathContext(context), this.settings().pathStyle);

    this.report(await writeText(reference(path)), 'Copied path to clipboard');
  }

  /**
   * Copy a shell command that starts a session with this note as the prompt.
   *
   * Frontmatter supplies the flags, so a note can carry its own model or effort
   * setting; the allowlist decides which keys are forwarded, because ordinary
   * properties like `tags` would otherwise become flags the CLI rejects.
   */
  async copyCommand(file: TFile): Promise<void> {
    const options = this.resolveOptions('paths');

    if (!options) return;

    const settings = this.settings();
    const note = await resolveNote(this.app, file, options);
    const related = await resolveRelated(this.app, [file], options);
    const { text } = render([note, ...related], this.renderOptions('paths'));

    const command = buildCommand({
      command: settings.cliCommand.trim(),
      subcommand: settings.cliSubcommand,
      flags: flagsFrom(
        this.app.metadataCache.getFileCache(file)?.frontmatter,
        parseList(settings.cliForwardKeys),
      ),
      // The directory the *reader* must be granted, which is the display base
      // when the vault is reached under a different path there.
      addDir: settings.cliAddVaultDir ? options.context.displayBase : undefined,
      addDirFlag: settings.cliAddDirFlag.trim(),
      extraArguments: settings.cliExtraArguments,
      prompt: text,
      heredocThreshold: settings.cliArgumentLimit,
    });

    this.report(await writeText(command), 'Copied command to clipboard');
  }

  /**
   * Put the note's images on the clipboard.
   *
   * The macOS pasteboard can hold a list of *files*, so one paste attaches all
   * of them at once. That path is unofficial, so it is verified rather than
   * assumed — and when it reports failure we fall back to copying one image at
   * a time rather than leaving an empty clipboard and no explanation.
   */
  async copyImages(file: TFile): Promise<void> {
    const options = this.resolveOptions('self-contained');

    if (!options) return;

    const note = await resolveNote(this.app, file, options);
    const { images } = render([note], this.renderOptions('self-contained'));

    if (images.length === 0) {
      new Notice('This note references no images');

      return;
    }

    // The setting exists as an escape hatch: the macOS pasteboard path is
    // unofficial, and a user seeing it misbehave needs a way to stop trying it.
    const outcome = this.settings().attachImageFiles
      ? writeFiles(images.map((image) => image.absolutePath))
      : 'unsupported';

    if (outcome === 'written') {
      this.queue = null;
      new Notice(`Copied ${count(images.length, 'image file')} to the clipboard`);

      return;
    }

    // Explain the degraded path once per set, rather than on every run.
    if (this.startQueue(file, images)) this.explainFallback(outcome, images.length);

    await this.copyNextImage();
  }

  /**
   * Say why images are arriving one at a time.
   *
   * The two reasons need different words. `unsupported` is simply how this
   * platform works and is worth stating once so the behaviour isn't puzzling.
   * `failed` means the macOS pasteboard write was attempted, verified, and came
   * back empty — the breakage the read-back check exists to catch. Degrading
   * silently there would waste the whole point of verifying it.
   */
  private explainFallback(outcome: FileClipboardResult, total: number): void {
    if (outcome === 'failed') {
      new Notice(
        'Could not put the image files on the clipboard. This usually means an Obsidian or macOS update changed the pasteboard format — please report it. Copying one image at a time instead.',
        EXPLANATION_MS,
      );

      return;
    }

    if (total > 1) {
      new Notice(
        `Attaching all images at once is macOS-only, so these ${total} copy one at a time.`,
        EXPLANATION_MS,
      );
    }
  }

  /** Start a queue for this set of images. Returns whether it is a new one. */
  private startQueue(file: TFile, images: ImageRef[]): boolean {
    const key = `${file.path}:${images.map((image) => image.absolutePath).join('|')}`;

    if (this.queue?.key === key) return false;

    this.queue = { key, images, index: 0 };

    return true;
  }

  /** Copy one image, advancing a cursor so repeated runs walk the whole set. */
  private async copyNextImage(): Promise<void> {
    if (!this.queue) return;

    const { images } = this.queue;
    const position = this.queue.index;
    const image = images[position];
    // getAbstractFileByPath rather than the newer getFileByPath, which needs
    // Obsidian 1.13. This form works on every version, which is what keeps
    // minAppVersion low — it is a compatibility choice, not a requirement.
    const found = image ? this.app.vault.getAbstractFileByPath(image.vaultPath) : null;
    const target = found instanceof TFile ? found : null;

    if (!target) {
      new Notice('That image is no longer in the vault');

      return;
    }

    const mimeType = MIME_TYPES[target.extension.toLowerCase()] ?? 'image/png';
    const written = await writeImage(await this.app.vault.readBinary(target), mimeType);

    this.queue.index = (position + 1) % images.length;

    const progress = `image ${position + 1} of ${images.length}`;
    const more = images.length > 1 ? ' — run again for the next' : '';

    this.report(
      written,
      `Copied ${progress}${more}`,
      `Could not copy ${target.name} — this platform may not accept ${mimeType} on the clipboard`,
    );
  }

  /** The exclusion rules, parsed from their settings fields. */
  private exclusions(): ExclusionRules {
    const settings = this.settings();

    return {
      tags: parseList(settings.excludeTags),
      folders: parseList(settings.excludeFolders),
      patterns: parseList(settings.redactPatterns),
    };
  }

  /** Resolve options for a mode, or null when the mode isn't usable here. */
  private resolveOptions(mode: RenderMode): ResolveOptions | null {
    const settings = this.settings();
    const context = vaultContext(this.app);

    if (!context && mode === 'paths') {
      new Notice('Paths are only available in the desktop app');

      return null;
    }

    return {
      // Self-contained output never prints a path, so a mobile vault with no
      // filesystem location can still use it.
      context: this.pathContext(context),
      pathStyle: settings.pathStyle,
      stripFrontmatter: settings.stripFrontmatter,
      stripTags: settings.stripTags,
      // Paths mode points at embeds rather than inlining them, so there is
      // nothing to load.
      embedDepth: mode === 'self-contained' ? settings.embedDepth : 0,
      linkDepth: settings.linkDepth,
      exclusions: this.exclusions(),
      imageExtensions: new Set(
        parseList(settings.imageExtensions).map((entry) => entry.replace(/^\./, '').toLowerCase()),
      ),
    };
  }

  /**
   * Where emitted paths should be rooted.
   *
   * `basePath` stays the vault's real location — the image clipboard has to
   * open actual files — while `displayBase` follows the override, so a session
   * running in WSL or a container is handed paths it can actually resolve.
   */
  private pathContext(context: VaultContext | null): VaultContext {
    const prefix = this.settings().pathPrefix.trim().replace(/\/+$/, '');
    const base = context?.basePath ?? '';

    return {
      basePath: base,
      displayBase: prefix || base,
      home: context?.home ?? '',
    };
  }

  private renderOptions(mode: RenderMode) {
    const settings = this.settings();

    return {
      mode,
      template: settings.template,
      fenceContent: settings.fenceContent,
      includeHeader: settings.includeHeader,
      stripComments: settings.stripComments,
      stripDynamicBlocks: settings.stripDynamicBlocks,
      nameExcluded: settings.nameExcluded,
    };
  }

  /** Render, optionally show it for review, then copy. */
  private async deliver(notes: RenderableNote[], mode: RenderMode): Promise<void> {
    const { text, images } = render(notes, this.renderOptions(mode));
    const chosen = notes.filter((note) => !note.related).length;
    const related = notes.length - chosen;

    const suffix =
      mode === 'self-contained' && images.length > 0
        ? ` — ${count(images.length, 'image')} to attach separately`
        : '';

    const finish = async (final: string): Promise<void> => {
      const subject = chosen === 1 ? 'Copied prompt' : `Copied ${count(chosen, 'note')}`;
      const reached = related > 0 ? ` (+${count(related, 'linked note')})` : '';

      this.report(await writeText(final), `${subject}${reached} to clipboard${suffix}`);
    };

    const settings = this.settings();
    const size = measure(text, chosen + related, images.length);
    const wanted =
      settings.previewMode === 'always' ||
      (settings.previewMode === 'large' && size.tokens >= settings.previewThreshold);

    if (!wanted) {
      await finish(text);

      return;
    }

    new PreviewModal(this.app, text, describe(size), (edited) => void finish(edited)).open();
  }

  private report(ok: boolean, success: string, failure?: string): void {
    new Notice(ok ? success : (failure ?? 'Could not write to the clipboard'));
  }
}

/** `1 note` / `3 notes`, so notices read like sentences. */
function count(total: number, noun: string): string {
  return `${total} ${noun}${total === 1 ? '' : 's'}`;
}
