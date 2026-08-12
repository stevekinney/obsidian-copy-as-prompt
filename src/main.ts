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
import type { RenderMode } from './render.js';
import {
  DEFAULT_SETTINGS,
  parseSettings,
  type PluginSettings,
  type SettingsHost,
} from './settings.js';
import { CopyAsPromptSettingTab } from './settings-tab.js';

/** Groups this plugin's entries together on a context menu. */
const MENU_SECTION = 'copy-as-prompt';

/** The CLI entry's title, shared by every menu that offers it. */
const CLI_TITLE = 'Copy as CLI command';

/**
 * A context-menu title.
 *
 * Menus, unlike the command palette, are not prefixed with the plugin name, so
 * the word "prompt" has to be in the title itself or there is nothing to say
 * what the entry does. Sentence case throughout, per Obsidian's conventions.
 */
function menuTitle(subject: string | null, mode: RenderMode): string {
  const what = subject ? `${subject} ` : '';
  const qualifier = mode === 'self-contained' ? ' (self-contained)' : '';

  return `Copy ${what}as prompt${qualifier}`;
}

/** The two output shapes, and how each is labelled to the user. */
const MODES: { mode: RenderMode; id: string; label: string }[] = [
  { mode: 'paths', id: 'paths', label: 'with @paths' },
  { mode: 'self-contained', id: 'self-contained', label: 'as self-contained text' },
];

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
   * Without this, the in-memory copy silently wins and overwrites it.
   */
  override async onExternalSettingsChange(): Promise<void> {
    await this.loadSettings();
  }

  private registerCommands(): void {
    for (const { mode, id, label } of MODES) {
      this.addCommand({
        id: `copy-note-${id}`,
        name: `Copy note ${label}`,
        checkCallback: (checking) => {
          const file = this.activeNote();

          if (!file || !this.supports(mode)) return false;
          if (!checking) this.copyNotes([file], mode);

          return true;
        },
      });

      this.addCommand({
        id: `copy-canvas-${id}`,
        name: `Copy canvas ${label}`,
        checkCallback: (checking) => {
          const file = this.activeCanvas();

          if (!file || !this.supports(mode)) return false;
          if (!checking) void this.copier.copyCanvas(file, mode);

          return true;
        },
      });

      this.addCommand({
        id: `copy-selection-${id}`,
        name: `Copy selection ${label}`,
        editorCheckCallback: (checking, editor: Editor, context: MarkdownFileInfo) => {
          if (!editor.somethingSelected() || !this.supports(mode)) return false;
          if (!checking) void this.copier.copySelection(editor, context, mode);

          return true;
        },
      });
    }

    this.addCommand({
      id: 'copy-note-path',
      name: 'Copy note path only',
      checkCallback: (checking) => {
        const file = this.activeNote();

        if (!file || !this.supports('paths')) return false;
        if (!checking) void this.copier.copyPath(file);

        return true;
      },
    });

    this.addCommand({
      id: 'copy-cli-command',
      name: CLI_TITLE,
      checkCallback: (checking) => {
        const file = this.activeNote();

        if (!file || !this.supports('paths')) return false;
        if (!checking) void this.copier.copyCommand(file);

        return true;
      },
    });

    this.addCommand({
      id: 'copy-referenced-images',
      name: 'Copy referenced images',
      checkCallback: (checking) => {
        const file = this.activeNote();

        if (!file) return false;
        if (!checking) void this.copier.copyImages(file);

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

  /**
   * The modes a context menu should offer.
   *
   * Folds together what the platform supports and what you asked for. If the
   * preference leaves nothing — asking for paths on mobile, say — it is ignored
   * rather than obeyed, because a context menu whose entries silently vanish
   * reads as a broken plugin, not as a setting working correctly.
   */
  private menuModes(): typeof MODES {
    const supported = MODES.filter(({ mode }) => this.supports(mode));
    const preference = this.settings.menuModes;

    if (preference === 'both') return supported;

    const chosen = supported.filter(({ mode }) => mode === preference);

    return chosen.length > 0 ? chosen : supported;
  }

  /** Add one grouped, prompt-labelled entry. */
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
   * The whole note comes first, because that is the common case — the earlier
   * behaviour offered only the selection, and offered nothing at all when there
   * wasn't one. Selection entries appear only when there is a selection to copy.
   */
  private addEditorItems(menu: Menu, editor: Editor, context: MarkdownFileInfo): void {
    const file = context.file;

    for (const { mode } of this.menuModes()) {
      if (!file) continue;

      this.addItem(menu, menuTitle(null, mode), () => this.copyNotes([file], mode));
    }

    if (editor.somethingSelected()) {
      for (const { mode } of this.menuModes()) {
        this.addItem(
          menu,
          menuTitle('selection', mode),
          () => void this.copier.copySelection(editor, context, mode),
        );
      }
    }

    if (file && this.supports('paths')) {
      this.addItem(menu, CLI_TITLE, () => void this.copier.copyCommand(file));
    }
  }

  /** Menu entries for a canvas, which is copied whole rather than as notes. */
  private addCanvasItems(menu: Menu, canvas: TFile): void {
    for (const { mode } of MODES) {
      if (!this.supports(mode)) continue;

      this.addItem(
        menu,
        menuTitle('canvas', mode),
        () => void this.copier.copyCanvas(canvas, mode),
      );
    }
  }

  private addFileItems(menu: Menu, files: readonly TAbstractFile[]): void {
    const only = files.length === 1 ? files[0] : null;

    if (only instanceof TFile && only.extension === 'canvas') {
      this.addCanvasItems(menu, only);

      return;
    }

    const notes = collectNotes(files);

    if (notes.length === 0) return;

    // "Copy as prompt" for one note; "Copy 12 notes as prompt" for a set, so the
    // scale of what you are about to copy is visible before you click.
    const subject = notes.length === 1 ? null : `${notes.length} notes`;

    for (const { mode } of this.menuModes()) {
      this.addItem(menu, menuTitle(subject, mode), () => this.copyNotes(notes, mode));
    }

    this.addCliItem(menu, notes);
  }

  /**
   * The CLI entry, offered only for a single note.
   *
   * It reads that note's frontmatter for its flags, so there is no sensible
   * answer for a multi-selection or a folder.
   */
  private addCliItem(menu: Menu, notes: readonly TFile[]): void {
    const note = notes.length === 1 ? notes[0] : null;

    if (!note || !this.supports('paths')) return;

    this.addItem(menu, CLI_TITLE, () => void this.copier.copyCommand(note));
  }

  /**
   * Copy notes, asking first when the set is large.
   *
   * Right-clicking a folder is one keystroke from concatenating several hundred
   * notes, which is occasionally intended and usually a misclick.
   */
  private copyNotes(notes: TFile[], mode: RenderMode): void {
    const run = (): void => void this.copier.copyNotes(notes, mode);

    if (notes.length <= this.settings.folderNoteLimit) {
      run();

      return;
    }

    new ConfirmModal(
      this.app,
      `This will copy ${notes.length} notes into one prompt. Continue?`,
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

  /** Paths mode needs a real filesystem location, which mobile doesn't have. */
  private supports(mode: RenderMode): boolean {
    return mode === 'self-contained' || this.copier.canUsePaths();
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
