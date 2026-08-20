import { MarkdownView, Notice, type App, type Plugin, type TFile } from 'obsidian';

import type { PluginSettings } from './settings.js';
import { copySkill, exportSkill } from './skill-export.js';
import { isSkillNote, SkillPanelView, SKILL_VIEW_TYPE } from './skill-view.js';

/** What the controller needs from the plugin that hosts it. */
export type SkillPanelHost = Pick<
  Plugin,
  'app' | 'registerEvent' | 'registerView' | 'addCommand'
> & {
  settings: PluginSettings;
};

/** The active note, or null when there isn't one or it isn't Markdown. */
function activeNote(app: App): TFile | null {
  const file = app.workspace.getActiveFile();

  return file?.extension === 'md' ? file : null;
}

/**
 * Everything about the skill frontmatter panel that would otherwise bloat
 * `main.ts`: registering the view and its four commands, the title-bar icon
 * lifecycle, and auto-open — including staying closed once the user closes
 * it themselves.
 */
export class SkillPanelController {
  private userClosed = false;
  private wasOpen = false;
  private readonly actions = new WeakMap<MarkdownView, HTMLElement>();

  constructor(private readonly host: SkillPanelHost) {}

  /** Register the view and commands. Call once from `onload`. */
  register(): void {
    this.host.registerView(SKILL_VIEW_TYPE, (leaf) => new SkillPanelView(leaf));
    this.registerCommands();
  }

  /**
   * Start auto-open and the title-bar icon. Call from `onLayoutReady`, not
   * `onload` — this fires on every `file-open`, and startup runs for every
   * enabled plugin.
   */
  registerWorkspaceEvents(): void {
    const { app } = this.host;

    this.host.registerEvent(app.workspace.on('file-open', () => this.handleActiveFileChange()));
    this.host.registerEvent(
      app.workspace.on('active-leaf-change', () => this.handleActiveFileChange()),
    );
    // A leaf the user closes stays closed until they reopen it themselves —
    // otherwise a skill note would make the panel impossible to dismiss.
    this.host.registerEvent(app.workspace.on('layout-change', () => this.trackClosure()));

    // Sync with whatever Obsidian already restored from the saved workspace
    // layout, so a panel left open across a restart isn't misread as "just closed".
    this.wasOpen = app.workspace.getLeavesOfType(SKILL_VIEW_TYPE).length > 0;

    this.handleActiveFileChange();
  }

  /** The skill-specific menu entries for one selected note, or none when it isn't a skill. */
  menuItems(note: TFile): { title: string; run: () => void }[] {
    const { app, settings } = this.host;
    const cache = app.metadataCache.getFileCache(note);

    if (!isSkillNote(cache?.frontmatter)) return [];

    return [
      { title: 'Copy note as skill', run: () => void copySkill(app, note, settings) },
      { title: 'Export note as skill', run: () => void exportSkill(app, note, settings) },
    ];
  }

  private registerCommands(): void {
    const { app, settings } = this.host;

    this.host.addCommand({
      id: 'open-skill-panel',
      name: 'Open skill panel',
      checkCallback: (checking) => {
        if (!checking) {
          this.userClosed = false;
          void this.reveal(true);
        }

        return true;
      },
    });

    this.host.addCommand({
      id: 'mark-note-as-skill',
      name: 'Mark note as a skill',
      checkCallback: (checking) => {
        const file = activeNote(app);

        if (!file) return false;
        if (!checking) void markAsSkill(app, file);

        return true;
      },
    });

    this.host.addCommand({
      id: 'copy-note-as-skill',
      name: 'Copy note as skill',
      checkCallback: (checking) => {
        const file = activeNote(app);

        if (!file) return false;
        if (!checking) void copySkill(app, file, settings);

        return true;
      },
    });

    this.host.addCommand({
      id: 'export-note-as-skill',
      name: 'Export note as skill',
      checkCallback: (checking) => {
        const file = activeNote(app);

        if (!file) return false;
        if (!checking) void exportSkill(app, file, settings);

        return true;
      },
    });
  }

  private handleActiveFileChange(): void {
    const { app, settings } = this.host;
    const file = activeNote(app);
    const cache = file ? app.metadataCache.getFileCache(file) : null;
    const skill = isSkillNote(cache?.frontmatter);

    this.updateAction(skill);

    if (skill && settings.skillPanel && !this.userClosed) void this.reveal(false);
  }

  /**
   * Add or remove the title-bar icon for the active `MarkdownView`.
   *
   * `addAction` is additive and a view instance is often reused across files
   * within the same tab, so an icon added for a skill note would otherwise
   * still be there after switching to a note that isn't one.
   */
  private updateAction(skill: boolean): void {
    const view = this.host.app.workspace.getActiveViewOfType(MarkdownView);

    if (!view) return;

    const existing = this.actions.get(view);

    if (skill) {
      if (existing) return;

      this.actions.set(
        view,
        view.addAction('sparkles', 'Open skill panel', () => {
          this.userClosed = false;
          void this.reveal(true);
        }),
      );

      return;
    }

    if (existing) {
      existing.remove();
      this.actions.delete(view);
    }
  }

  private trackClosure(): void {
    const open = this.host.app.workspace.getLeavesOfType(SKILL_VIEW_TYPE).length > 0;

    if (this.wasOpen && !open) this.userClosed = true;

    this.wasOpen = open;
  }

  /**
   * Show the panel, creating it in the right sidebar if it doesn't exist yet.
   *
   * @param focus - Whether to bring it to the front. Auto-open never does —
   * stealing focus from the editor on every file switch would be intolerable.
   */
  private async reveal(focus: boolean): Promise<void> {
    const { workspace } = this.host.app;
    const [existing] = workspace.getLeavesOfType(SKILL_VIEW_TYPE);

    if (existing) {
      if (focus) await workspace.revealLeaf(existing);

      return;
    }

    const leaf = workspace.getRightLeaf(false);

    if (!leaf) return;

    await leaf.setViewState({ type: SKILL_VIEW_TYPE, active: focus });
    await workspace.revealLeaf(leaf);
  }
}

async function markAsSkill(app: App, file: TFile): Promise<void> {
  try {
    await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
      frontmatter['skill'] = true;
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    new Notice(`Could not mark this note as a skill: ${detail}`);
  }
}
