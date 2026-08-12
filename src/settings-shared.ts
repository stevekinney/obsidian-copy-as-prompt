import type { Plugin } from 'obsidian';

import type {
  BooleanSettingKey,
  PluginSettings,
  SettingsHost,
  StringSettingKey,
} from './settings.js';

/**
 * What a settings section needs from the tab that hosts it.
 *
 * The tab owns persistence and the shared row helpers; sections own layout and
 * wording. Passing this around rather than the tab itself keeps the section
 * modules from importing the tab and the tab from importing all of them.
 */
export type SettingsSection = {
  containerEl: HTMLElement;
  host: SettingsHost & Plugin;
  /** Save one field. */
  persist<K extends keyof PluginSettings>(key: K, value: PluginSettings[K]): Promise<void>;
  /** Re-render the whole tab, so an add or remove is reflected immediately. */
  refresh(): void;
  /** A section heading. */
  heading(name: string): void;
  /** A labelled on/off row. */
  toggle(key: BooleanSettingKey, name: string, description: string): void;
  /** A multi-line field holding a comma or newline separated list. */
  list(key: StringSettingKey, name: string, description: string, placeholder: string): void;
  /** A single-line text field. */
  text(key: StringSettingKey, name: string, description: string, placeholder: string): void;
  /** A whole-number field, rejecting anything below `minimum`. */
  number(
    key: 'previewThreshold' | 'cliArgumentLimit' | 'folderNoteLimit',
    name: string,
    description: string,
    minimum: number,
  ): void;
};
