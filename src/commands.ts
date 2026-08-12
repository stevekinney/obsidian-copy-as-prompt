import { Notice, type App, type Editor, type MarkdownFileInfo, type TFile } from 'obsidian';

import { writeText } from './clipboard.js';
import { describe, measure } from './estimate.js';
import type { ExclusionRules } from './exclusions.js';
import { parseLines, parseList } from './list-field.js';
import { displayPath, reference } from './paths.js';
import { PreviewModal } from './preview-modal.js';
import { sliceBody } from './references.js';
import { render, type RenderableNote } from './render.js';
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
 * `main.ts` decides *when* these run; this decides what they do.
 */
export class PromptCopier {
  /**
   * The vault's location, resolved once.
   *
   * `canUsePaths` runs from every command's `checkCallback`, which fires on
   * each command-palette keystroke. Resolving it there meant a `require` and a
   * `homedir()` syscall per keystroke, and neither answer changes while the app
   * is open.
   */
  private context?: VaultContext | null;

  constructor(
    private readonly app: App,
    private readonly settings: () => PluginSettings,
  ) {}

  /** Whether real filesystem paths are available. False on mobile. */
  canUsePaths(): boolean {
    this.context ??= vaultContext(this.app);

    return this.context !== null;
  }

  /** The notes from a selection that the exclusion rules allow. */
  allowedNotes(files: readonly TFile[]): TFile[] {
    const rules = this.exclusions();

    return files.filter((file) => !isFileExcluded(this.app, file, rules));
  }

  /** Copy one or more whole notes, following links as far as configured. */
  async copyNotes(files: readonly TFile[]): Promise<void> {
    const options = this.resolveOptions();

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
    const related = resolveRelated(this.app, allowed, options);

    await this.deliver([...notes, ...related]);
  }

  /** Copy a canvas: its text nodes as prose, its file nodes as paths. */
  async copyCanvas(file: TFile): Promise<void> {
    const options = this.resolveOptions();

    if (!options || this.refuse(file, options.exclusions)) return;

    const note = await resolveCanvas(this.app, file, options);

    if (note.body.content.length === 0) {
      new Notice('This canvas has nothing to copy');

      return;
    }

    await this.deliver([note]);
  }

  /** Copy just the selected text, with its links resolved. */
  async copySelection(editor: Editor, context: MarkdownFileInfo): Promise<void> {
    const file = context.file;
    const options = this.resolveOptions();

    if (!file || !options || this.refuse(file, options.exclusions)) return;

    // The editor's buffer, not the file: `posToOffset` indexes the live text,
    // and Obsidian only autosaves a couple of seconds after you stop typing. On
    // disk content those offsets address the wrong window entirely.
    const note = await resolveNote(this.app, file, options, editor.getValue());
    const from = editor.posToOffset(editor.getCursor('from'));
    const to = editor.posToOffset(editor.getCursor('to'));

    await this.deliver([{ ...note, body: sliceBody(note.body, from, to) }]);
  }

  /** Copy the note's `@path` and nothing else. */
  async copyPath(file: TFile): Promise<void> {
    const options = this.resolveOptions();

    if (!options || this.refuse(file, options.exclusions)) return;

    const path = displayPath(file.path, options.context, options.pathStyle);

    this.report(await writeText(reference(path)), 'Copied path to clipboard');
  }

  /**
   * Whether this file is withheld, telling the user when it is.
   *
   * Every entry point has to ask. The rules are the plugin's only privacy
   * guarantee, and one that holds on some paths and not others is worse than
   * none — people calibrate trust on the path that worked.
   *
   * A path is withheld too: a filename can be the sensitive part, which is the
   * whole reason excluded notes are unnamed by default.
   */
  private refuse(file: TFile, rules: ExclusionRules): boolean {
    if (!isFileExcluded(this.app, file, rules)) return false;

    new Notice('That note is excluded by your rules');

    return true;
  }

  /** The exclusion rules, parsed from their settings fields. */
  private exclusions(): ExclusionRules {
    const settings = this.settings();

    return {
      tags: parseList(settings.excludeTags),
      folders: parseList(settings.excludeFolders),
      patterns: parseLines(settings.redactPatterns),
    };
  }

  /**
   * Where emitted paths should be rooted.
   *
   * `basePath` stays the vault's real location while `displayBase` follows the
   * override, so a session running in WSL or a container is handed paths it can
   * actually resolve.
   */
  private pathContext(context: VaultContext): VaultContext {
    const prefix = this.settings().pathPrefix.trim().replace(/\/+$/, '');

    return {
      basePath: context.basePath,
      displayBase: prefix || context.basePath,
      home: context.home,
    };
  }

  /** Resolve options, or null when paths aren't available here. */
  private resolveOptions(): ResolveOptions | null {
    const settings = this.settings();

    this.context ??= vaultContext(this.app);

    const context = this.context;

    if (!context) {
      new Notice('This plugin needs the desktop app, where the vault has a filesystem path');

      return null;
    }

    return {
      context: this.pathContext(context),
      pathStyle: settings.pathStyle,
      stripFrontmatter: settings.stripFrontmatter,
      stripTags: settings.stripTags,
      linkDepth: settings.linkDepth,
      exclusions: this.exclusions(),
    };
  }

  private renderOptions() {
    const settings = this.settings();

    return {
      template: settings.template,
      fenceContent: settings.fenceContent,
      includeHeader: settings.includeHeader,
      stripComments: settings.stripComments,
      stripDynamicBlocks: settings.stripDynamicBlocks,
      nameExcluded: settings.nameExcluded,
      redactPatterns: parseLines(settings.redactPatterns),
    };
  }

  /**
   * Run an operation, surfacing a failure instead of swallowing it.
   *
   * Without this a rejected read — a note deleted or renamed between the menu
   * being built and clicked — produced no notice, no clipboard write, and no
   * visible change. The clipboard kept its previous contents, so the next paste
   * quietly delivered the *last* copy.
   */
  async attempt(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      new Notice(`Copy as prompt failed: ${detail}`);
    }
  }

  /** Render, optionally show it for review, then copy. */
  private async deliver(notes: RenderableNote[]): Promise<void> {
    const text = render(notes, this.renderOptions());

    // An empty write clears the clipboard and reports success, which destroys
    // whatever was there and looks identical to having worked.
    if (text.trim().length === 0) {
      new Notice('Nothing to copy — that came out empty');

      return;
    }

    this.warnAboutTemplate(notes);
    const chosen = notes.filter((note) => !note.related).length;
    const related = notes.length - chosen;

    const finish = async (final: string): Promise<void> => {
      // Also guarded here: the review modal is editable, so a select-all and
      // delete would otherwise wipe the clipboard and report success.
      if (final.trim().length === 0) {
        new Notice('Nothing to copy — that came out empty');

        return;
      }

      const subject = chosen === 1 ? 'Copied prompt' : `Copied ${count(chosen, 'note')}`;
      const reached = related > 0 ? ` (+${count(related, 'linked note')})` : '';

      this.report(await writeText(final), `${subject}${reached} to clipboard`);
    };

    const settings = this.settings();
    const size = measure(text, notes.length);
    const wanted =
      settings.previewMode === 'always' ||
      (settings.previewMode === 'large' && size.tokens >= settings.previewThreshold);

    if (!wanted) {
      await finish(text);

      return;
    }

    new PreviewModal(this.app, text, describe(size), (edited) => void finish(edited)).open();
  }

  /**
   * Say so when a template asks for something a multi-note copy cannot give.
   *
   * `{{path}}` has no single value for a set, so it renders empty and a
   * template reading "Review the note at {{path}}:" silently becomes "Review
   * the note at :".
   */
  private warnAboutTemplate(notes: RenderableNote[]): void {
    const chosen = notes.filter((note) => !note.related).length;

    if (chosen < 2 || !this.settings().template.includes('{{path}}')) return;

    new Notice(`Your template uses {{path}}, which has no single value for ${chosen} notes.`);
  }

  private report(ok: boolean, success: string): void {
    new Notice(ok ? success : 'Could not write to the clipboard');
  }
}

/** `1 note` / `3 notes`, so notices read like sentences. */
function count(total: number, noun: string): string {
  return `${total} ${noun}${total === 1 ? '' : 's'}`;
}
