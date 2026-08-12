import {
  Plugin,
  TFile,
  TFolder,
  type Editor,
  type MarkdownFileInfo,
  type Menu,
  type TAbstractFile,
} from 'obsidian';

import { PromptCopier } from './commands.js';
import { ConfirmModal } from './confirm-modal.js';
import {
  DEFAULT_SETTINGS,
  parseSettings,
  type PluginSettings,
  type SettingsHost,
} from './settings.js';
import { CopyAsPromptSettingTab } from './settings-tab.js';

/** Groups this plugin's entries together on a context menu. */
const MENU_SECTION = 'copy-as-prompt';

/**
 * Copy notes to the clipboard, formatted as a prompt.
 *
 * Every registration here goes through `addCommand`, `addSettingTab`, or
 * `registerEvent`, which Obsidian unregisters automatically on unload — so
 * there is nothing for `onunload()` to clean up. If you add a `setInterval`, a
 * DOM listener, or a custom view, register it through `this.registerInterval`,
 * `this.registerDomEvent`, or `this.registerEvent` so that stays true.
 */
export default class CopyAsPromptPlugin extends Plugin implements SettingsHost {
  // `Plugin.settings` exists as `unknown` in the API; narrowing it here is what
  // lets the built-in settings plumbing read the real shape.
  override settings: PluginSettings = DEFAULT_SETTINGS;

  private copier!: PromptCopier;

  override async onload(): Promise<void> {
    await this.loadSettings();

    this.copier = new PromptCopier(this.app, () => this.settings);

    this.registerCommands();
    this.registerMenus();
    this.addSettingTab(new CopyAsPromptSettingTab(this));
  }

  /** Load settings from `data.json`, falling back to defaults per field. */
  async loadSettings(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
  }

  /** Persist the current settings to `data.json`. */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Reload settings when something outside Obsidian rewrites `data.json` —
   * most often Obsidian Sync propagating a change from another device.
   */
  override async onExternalSettingsChange(): Promise<void> {
    await this.loadSettings();
  }

  private registerCommands(): void {
    this.addCommand({
      id: 'copy-note',
      name: 'Copy note as prompt',
      checkCallback: (checking) => {
        const file = this.activeNote();

        if (!file || !this.supported()) return false;
        if (!checking) this.copyNotes([file]);

        return true;
      },
    });

    this.addCommand({
      id: 'copy-canvas',
      name: 'Copy canvas as prompt',
      checkCallback: (checking) => {
        const file = this.activeCanvas();

        if (!file || !this.supported()) return false;
        if (!checking) void this.copier.attempt(() => this.copier.copyCanvas(file));

        return true;
      },
    });

    this.addCommand({
      id: 'copy-selection',
      name: 'Copy selection as prompt',
      editorCheckCallback: (checking, editor: Editor, context: MarkdownFileInfo) => {
        if (!editor.somethingSelected() || !this.supported()) return false;
        if (!checking) void this.copier.attempt(() => this.copier.copySelection(editor, context));

        return true;
      },
    });

    this.addCommand({
      id: 'copy-note-path',
      name: 'Copy note path only',
      checkCallback: (checking) => {
        const file = this.activeNote();

        if (!file || !this.supported()) return false;
        if (!checking) void this.copier.attempt(() => this.copier.copyPath(file));

        return true;
      },
    });
  }

  private registerMenus(): void {
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => this.addFileItems(menu, [file])),
    );

    this.registerEvent(
      this.app.workspace.on('files-menu', (menu, files) => this.addFileItems(menu, files)),
    );

    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor: Editor, context) => {
        this.addEditorItems(menu, editor, context);
      }),
    );
  }

  /** Add one grouped entry. */
  private addItem(menu: Menu, title: string, run: () => void): void {
    menu.addItem((item) =>
      item
        .setTitle(title)
        .setIcon('clipboard-copy')
        // A shared section keeps these together behind one separator instead of
        // scattering them through whatever else is on the menu.
        .setSection(MENU_SECTION)
        .onClick(run),
    );
  }

  /**
   * Entries for the editor's context menu.
   *
   * The whole note comes first, because that is the common case. The selection
   * entry appears only when there is a selection to copy.
   */
  private addEditorItems(menu: Menu, editor: Editor, context: MarkdownFileInfo): void {
    const file = context.file;

    if (!this.supported()) return;

    if (file) this.addItem(menu, 'Copy as prompt', () => this.copyNotes([file]));

    if (editor.somethingSelected()) {
      this.addItem(
        menu,
        'Copy selection as prompt',
        () => void this.copier.attempt(() => this.copier.copySelection(editor, context)),
      );
    }
  }

  private addFileItems(menu: Menu, files: readonly TAbstractFile[]): void {
    if (!this.supported()) return;

    const only = files.length === 1 ? files[0] : null;

    if (only instanceof TFile && only.extension === 'canvas') {
      this.addItem(
        menu,
        'Copy canvas as prompt',
        () => void this.copier.attempt(() => this.copier.copyCanvas(only)),
      );

      return;
    }

    // Counted after exclusion: offering "Copy 300 notes as prompt" and then
    // saying "every selected note is excluded" is a label that lies.
    const notes = this.copier.allowedNotes(collectNotes(files));

    if (notes.length === 0) return;

    // "Copy as prompt" for one note; "Copy 12 notes as prompt" for a set, so the
    // scale of what you are about to copy is visible before you click.
    const title = notes.length === 1 ? 'Copy as prompt' : `Copy ${notes.length} notes as prompt`;

    this.addItem(menu, title, () => this.copyNotes(notes));
  }

  /**
   * Copy notes, asking first when the set is large.
   *
   * Right-clicking a folder is one keystroke from concatenating several hundred
   * notes, which is occasionally intended and usually a misclick.
   */
  private copyNotes(notes: TFile[]): void {
    const run = (): void => void this.copier.attempt(() => this.copier.copyNotes(notes));
    // Count what will actually be copied. Counting the file tree instead meant
    // asking "copy 300 notes?" and then copying the 10 that survived exclusion.
    const allowed = this.copier.allowedNotes(notes);

    // Deliberately not skipped when review is on. The review modal appears
    // *after* every note has been read and concatenated, so it is not a
    // substitute for a guard that runs before that work — skipping it left the
    // most cautious setting with no protection at all.
    if (allowed.length <= this.settings.folderNoteLimit) {
      run();

      return;
    }

    new ConfirmModal(
      this.app,
      `This will copy ${allowed.length} notes into one prompt. Continue?`,
      run,
    ).open();
  }

  /** The active Markdown note, if there is one. */
  private activeNote(): TFile | null {
    const file = this.app.workspace.getActiveFile();

    return file?.extension === 'md' ? file : null;
  }

  /** The active canvas, if one is open. */
  private activeCanvas(): TFile | null {
    const file = this.app.workspace.getActiveFile();

    return file?.extension === 'canvas' ? file : null;
  }

  /** Paths need a real filesystem location, which mobile doesn't have. */
  private supported(): boolean {
    return this.copier.canUsePaths();
  }
}

/** Flatten a selection of files and folders into the Markdown notes inside it. */
function collectNotes(files: readonly TAbstractFile[]): TFile[] {
  const notes: TFile[] = [];
  const seen = new Set<string>();

  const visit = (item: TAbstractFile): void => {
    if (item instanceof TFolder) {
      for (const child of item.children) visit(child);

      return;
    }

    if (item instanceof TFile && item.extension === 'md' && !seen.has(item.path)) {
      seen.add(item.path);
      notes.push(item);
    }
  };

  for (const file of files) visit(file);

  return notes;
}
