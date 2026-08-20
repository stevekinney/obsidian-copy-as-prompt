import { ItemView, Notice, Setting, TFile, type IconName } from 'obsidian';

import { parseList } from './list-field.js';
import { SKILL_FIELDS, type SkillField, type SkillFieldKey } from './skill-fields.js';
import {
  parseSkillFrontmatter,
  toSkillRecord,
  type ParsedSkillFrontmatter,
} from './skill-frontmatter.js';
import { validateSkill, type SkillIssue } from './skill-validation.js';

/** The panel's registered view type. */
export const SKILL_VIEW_TYPE = 'copy-as-prompt-skill';

/** How long a text or textarea field waits after the last keystroke before writing. */
const DEBOUNCE_MS = 500;

/** Whether a note's frontmatter marks it as a skill. */
export function isSkillNote(frontmatter: Record<string, unknown> | undefined): boolean {
  return frontmatter?.['skill'] === true;
}

function isMetadata(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function metadataToText(value: unknown): string {
  if (!isMetadata(value)) return '';

  return Object.entries(value)
    .map(([key, entry]) => `${key}: ${entry}`)
    .join('\n');
}

function textToMetadata(value: string): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  let any = false;

  for (const line of value.split('\n')) {
    const trimmed = line.trim();
    const separator = trimmed.indexOf(':');

    if (!trimmed || separator < 0) continue;

    const key = trimmed.slice(0, separator).trim();

    if (!key) continue;

    result[key] = trimmed.slice(separator + 1).trim();
    any = true;
  }

  return any ? result : undefined;
}

function textToList(value: string): string[] | undefined {
  const parsed = parseList(value);

  return parsed.length > 0 ? parsed : undefined;
}

/**
 * The skill frontmatter panel.
 *
 * A right-sidebar view that edits every field {@link SKILL_FIELDS} declares
 * for the active note, when that note's frontmatter marks it a skill.
 * Reading goes through the metadata cache; writing goes through
 * `processFrontMatter`, the sanctioned atomic API and the only one that
 * leaves every other frontmatter key — including `skill` itself — untouched.
 *
 * Our own write re-triggers the metadata cache's `changed` event, which
 * would otherwise re-render the panel mid-keystroke. Two guards: every
 * refresh is compared against the frontmatter this view itself last
 * produced and is a no-op when nothing actually changed — a write counter
 * would not be reliable here, since the cache reparses asynchronously and
 * `changed` can fire well after a write's promise has already resolved; and
 * a rebuild is deferred entirely while a text field in this panel has
 * focus, so a hand-edit elsewhere never steals the cursor out from under
 * whatever the user is currently typing here.
 */
export class SkillPanelView extends ItemView {
  private file: TFile | null = null;
  private lastRecord = '';
  private readonly pending = new Map<
    SkillFieldKey,
    { file: TFile; value: unknown; timer: ReturnType<typeof setTimeout> }
  >();

  override getViewType(): string {
    return SKILL_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return 'Skill';
  }

  override getIcon(): IconName {
    return 'sparkles';
  }

  override async onOpen(): Promise<void> {
    this.registerEvent(this.app.workspace.on('file-open', () => this.refresh()));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.refresh()));
    this.registerEvent(
      this.app.metadataCache.on('changed', (file) => {
        if (this.file && file.path === this.file.path) this.refresh();
      }),
    );

    this.refresh();
  }

  override async onClose(): Promise<void> {
    this.flushPending();
  }

  /** Whether a text field inside this panel currently has focus. */
  private isEditing(): boolean {
    const active = document.activeElement;

    return (
      active instanceof HTMLElement &&
      this.contentEl.contains(active) &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
    );
  }

  /** Re-read the active file and re-render, unless nothing has actually changed. */
  private refresh(): void {
    const active = this.app.workspace.getActiveFile();
    const file = active?.extension === 'md' ? active : null;

    if (file?.path !== this.file?.path) this.resetForFileChange();

    this.file = file;

    if (!file) {
      this.renderEmptyState('Open a Markdown note to edit its skill frontmatter.');

      return;
    }

    this.refreshSkillFields(file);
  }

  /** A debounced write mid-flight for the previous file has nothing left to catch up to. */
  private resetForFileChange(): void {
    this.flushPending();
    this.lastRecord = '';
  }

  private refreshSkillFields(file: TFile): void {
    const cache = this.app.metadataCache.getFileCache(file);

    if (!isSkillNote(cache?.frontmatter)) {
      this.renderEmptyState('This note is not a skill.', file);

      return;
    }

    const parsed = parseSkillFrontmatter(cache?.frontmatter);
    const record = JSON.stringify(toSkillRecord(parsed));

    if (record === this.lastRecord) return;

    // Record the change either way, so the panel catches up the moment focus
    // leaves — deferring only the DOM rebuild itself.
    this.lastRecord = record;

    if (this.isEditing()) return;

    this.renderFields(file, parsed);
  }

  private renderEmptyState(message: string, file?: TFile): void {
    const container = this.contentEl;

    container.empty();
    container.createEl('p', { text: message, cls: 'copy-as-prompt-empty' });

    if (!file) return;

    new Setting(container).addButton((button) =>
      button
        .setButtonText('Mark this note as a skill')
        .setCta()
        .onClick(() => void this.markAsSkill(file)),
    );
  }

  private async markAsSkill(file: TFile): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(
        file,
        (frontmatter: Record<string, unknown>) => {
          frontmatter['skill'] = true;
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      new Notice(`Could not mark this note as a skill: ${detail}`);
    }

    this.lastRecord = '';
    this.refresh();
  }

  private renderFields(file: TFile, parsed: ParsedSkillFrontmatter): void {
    const container = this.contentEl;

    container.empty();

    const issues = validateSkill(parsed.frontmatter, '');

    this.renderGroup(container, 'Standard fields', undefined, 'standard', file, parsed, issues);
    this.renderGroup(
      container,
      'Claude Code fields',
      'Ignored outside Claude Code, and rejected outright by the claude.ai upload path.',
      'claude',
      file,
      parsed,
      issues,
    );

    const preservedKeys = Object.keys(parsed.preserved);

    if (preservedKeys.length === 0) return;

    new Setting(container).setName('Preserved fields').setHeading();

    for (const key of preservedKeys) {
      new Setting(container)
        .setName(key)
        .setDesc('Present in this note. Edit it in the frontmatter directly.')
        .setDisabled(true);
    }
  }

  private renderGroup(
    container: HTMLElement,
    heading: string,
    description: string | undefined,
    group: SkillField['group'],
    file: TFile,
    parsed: ParsedSkillFrontmatter,
    issues: SkillIssue[],
  ): void {
    const headingSetting = new Setting(container).setName(heading).setHeading();

    if (description) headingSetting.setDesc(description);

    for (const field of SKILL_FIELDS) {
      if (field.group === group) this.renderField(container, file, field, parsed, issues);
    }
  }

  private renderField(
    container: HTMLElement,
    file: TFile,
    field: SkillField,
    parsed: ParsedSkillFrontmatter,
    issues: SkillIssue[],
  ): void {
    const setting = new Setting(container).setName(field.name).setDesc(field.description);
    const current = parsed.frontmatter[field.key];
    const control = field.control;

    if (control.kind === 'toggle') {
      setting.addToggle((toggle) =>
        toggle
          .setValue(current === true)
          .onChange((value) => void this.writeField(file, field.key, value ? true : undefined)),
      );
    } else if (control.kind === 'select') {
      setting.addDropdown((dropdown) => {
        dropdown.addOption('', '—');

        for (const option of control.options) dropdown.addOption(option.value, option.label);

        dropdown
          .setValue(typeof current === 'string' ? current : '')
          .onChange((value) => void this.writeField(file, field.key, value || undefined));
      });
    } else if (control.kind === 'pairs') {
      setting.addTextArea((text) => {
        text.inputEl.rows = 3;
        text.inputEl.addClass('copy-as-prompt-list');
        text
          .setPlaceholder(control.placeholder ?? 'key: value')
          .setValue(metadataToText(current))
          .onChange((value) => this.scheduleWrite(file, field.key, textToMetadata(value)));
      });
    } else if (control.kind === 'list') {
      setting.addTextArea((text) => {
        text.inputEl.rows = 3;
        text.inputEl.addClass('copy-as-prompt-list');
        text
          .setPlaceholder(control.placeholder ?? '')
          .setValue(Array.isArray(current) ? current.join('\n') : '')
          .onChange((value) => this.scheduleWrite(file, field.key, textToList(value)));
      });
    } else if (control.kind === 'textarea') {
      setting.addTextArea((text) => {
        text.inputEl.rows = control.rows ?? 2;
        text
          .setPlaceholder(control.placeholder ?? '')
          .setValue(typeof current === 'string' ? current : '')
          .onChange((value) => this.scheduleWrite(file, field.key, value.trim() || undefined));
      });
    } else {
      setting.addText((text) =>
        text
          .setPlaceholder(control.placeholder ?? '')
          .setValue(typeof current === 'string' ? current : '')
          .onChange((value) => this.scheduleWrite(file, field.key, value.trim() || undefined)),
      );
    }

    // A hand-built element rather than `Setting.setErrorMessage`, which needs
    // Obsidian 1.13 — this plugin's `minAppVersion` stays at 1.7.2.
    const error = issues.find((issue) => issue.field === field.key && issue.severity === 'error');

    if (error) {
      setting.descEl.createEl('div', { text: error.message, cls: 'copy-as-prompt-skill-error' });
    }
  }

  /** Debounce a text-field write so every keystroke doesn't trigger its own atomic frontmatter rewrite. */
  private scheduleWrite(file: TFile, key: SkillFieldKey, value: unknown): void {
    const existing = this.pending.get(key);

    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      this.pending.delete(key);
      void this.writeField(file, key, value);
    }, DEBOUNCE_MS);

    this.pending.set(key, { file, value, timer });
  }

  /** Fire every debounced write immediately, so switching notes or closing the panel never drops one. */
  private flushPending(): void {
    for (const [key, entry] of this.pending) {
      clearTimeout(entry.timer);
      void this.writeField(entry.file, key, entry.value);
    }

    this.pending.clear();
  }

  private async writeField(file: TFile, key: SkillFieldKey, value: unknown): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(
        file,
        (frontmatter: Record<string, unknown>) => {
          if (value === undefined) delete frontmatter[key];
          else frontmatter[key] = value;
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      new Notice(`Could not save this field: ${detail}`);
    }
  }
}
