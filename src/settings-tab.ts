import { Notice, PluginSettingTab, Setting, type Plugin } from 'obsidian';

import {
  DEFAULT_SETTINGS,
  type BooleanSettingKey,
  type PluginSettings,
  type SettingsHost,
  type StringSettingKey,
} from './settings.js';
import { renderAdvancedSettings, renderBehaviorSettings } from './settings-behavior.js';
import {
  renderCleanupSettings,
  renderContextSettings,
  renderFileSettings,
  renderPrivacySettings,
  renderPromptSettings,
} from './settings-content.js';
import type { SettingsSection } from './settings-shared.js';

const LIST_ROWS = 3;

/** A plugin that also exposes settings — what this tab needs to do its job. */
type Host = SettingsHost & Plugin;

/** The numeric settings, which share one input treatment. */
type NumberKey = 'previewThreshold' | 'folderNoteLimit';

/**
 * The plugin's settings pane.
 *
 * This class owns persistence and the shared row helpers; the section modules
 * own layout and wording. The order in `display` is the information
 * architecture, and it reads top to bottom as a sequence of questions: what
 * does the prompt look like, how much goes into it, what must never go into
 * it, how is it delivered, and how much does the plugin get in the way.
 *
 * Obsidian's conventions apply throughout: sentence case, no top-level heading
 * (the tab is already labelled with the plugin name), and `Setting` rows
 * rather than hand-rolled markup.
 */
export class CopyAsPromptSettingTab extends PluginSettingTab {
  private readonly host: Host;

  constructor(host: Host) {
    super(host.app, host);
    this.host = host;
  }

  /** Persist a single field. `update` is taken by the base class. */
  private async persist<K extends keyof PluginSettings>(
    key: K,
    value: PluginSettings[K],
  ): Promise<void> {
    this.host.settings[key] = value;

    try {
      await this.host.saveSettings();
    } catch (error) {
      // The in-memory assignment above already took effect, so without this the
      // setting works perfectly all session and is silently gone after restart.
      // For an exclusion or redaction rule that is the worst possible outcome.
      const detail = error instanceof Error ? error.message : String(error);

      new Notice(`Could not save settings: ${detail}`);
    }
  }

  /** The plumbing every section shares. */
  private section(): SettingsSection {
    return {
      containerEl: this.containerEl,
      host: this.host,
      persist: (key, value) => this.persist(key, value),
      refresh: () => this.display(),
      heading: (name) => {
        new Setting(this.containerEl).setName(name).setHeading();
      },
      toggle: (key, name, description) => this.toggle(key, name, description),
      list: (key, name, description, placeholder) =>
        this.field(key, name, description, placeholder, LIST_ROWS),
      text: (key, name, description, placeholder) =>
        this.field(key, name, description, placeholder, 0),
      number: (key, name, description, minimum) => this.number(key, name, description, minimum),
    };
  }

  private toggle(key: BooleanSettingKey, name: string, description: string): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addToggle((control) =>
        control
          .setValue(this.host.settings[key])
          .onChange(async (value) => this.persist(key, value)),
      );
  }

  /** A text field, multi-line when `rows` is above zero. */
  private field(
    key: StringSettingKey,
    name: string,
    description: string,
    placeholder: string,
    rows: number,
  ): void {
    const setting = new Setting(this.containerEl).setName(name).setDesc(description);
    const value = this.host.settings[key];
    const save = async (next: string): Promise<void> => this.persist(key, next);

    if (rows > 0) {
      setting.addTextArea((text) => {
        text.inputEl.rows = rows;
        text.inputEl.addClass('copy-as-prompt-list');
        text.setPlaceholder(placeholder).setValue(value).onChange(save);
      });

      return;
    }

    setting.addText((text) => text.setPlaceholder(placeholder).setValue(value).onChange(save));
  }

  /**
   * A whole-number field.
   *
   * Invalid input is ignored rather than saved, so a half-typed number never
   * becomes a stored zero.
   */
  private number(key: NumberKey, name: string, description: string, minimum: number): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addText((text) =>
        text.setValue(String(this.host.settings[key])).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);

          if (Number.isFinite(parsed) && parsed >= minimum) await this.persist(key, parsed);
        }),
      );
  }

  override display(): void {
    this.containerEl.empty();

    const section = this.section();

    renderPromptSettings(section);
    renderContextSettings(section);
    renderPrivacySettings(section);
    renderCleanupSettings(section);
    renderFileSettings(section);
    renderBehaviorSettings(section);
    renderAdvancedSettings(section);

    new Setting(this.containerEl).addButton((button) =>
      button.setButtonText('Restore defaults').onClick(async () => {
        Object.assign(this.host.settings, DEFAULT_SETTINGS);
        await this.host.saveSettings();
        this.display();
      }),
    );
  }
}
