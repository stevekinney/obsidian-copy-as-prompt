import { PluginSettingTab, Setting, type Plugin } from 'obsidian';

import {
  DEFAULT_SETTINGS,
  MAX_EMBED_DEPTH,
  MAX_LINK_DEPTH,
  toPreviewMode,
  type StringSettingKey,
  type BooleanSettingKey,
  type PluginSettings,
  type SettingsHost,
} from './settings.js';
import { vaultContext } from './vault.js';

const TEMPLATE_ROWS = 6;
const LIST_ROWS = 3;

/** A plugin that also exposes settings — what this tab needs to do its job. */
type Host = SettingsHost & Plugin;

/**
 * The plugin's settings pane.
 *
 * Obsidian's conventions apply here: sentence case throughout, no top-level
 * heading (the tab is already labelled with the plugin name), and `Setting`
 * rows rather than hand-rolled markup.
 *
 * This depends on {@link SettingsHost} rather than on the plugin class so the
 * tab and `main.ts` don't import each other.
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
    await this.host.saveSettings();
  }

  /** A multi-line field for a comma or newline separated list. */
  private list(
    key: StringSettingKey,
    name: string,
    description: string,
    placeholder: string,
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addTextArea((text) => {
        text.inputEl.rows = LIST_ROWS;
        text.inputEl.addClass('copy-as-prompt-list');
        text
          .setPlaceholder(placeholder)
          .setValue(this.host.settings[key])
          .onChange(async (value) => this.persist(key, value));
      });
  }

  /** A labelled on/off row for one boolean setting. */
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

  override display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Prompt template')
      .setDesc('Use {{title}}, {{path}}, and {{content}} as placeholders.')
      .addTextArea((text) => {
        text.inputEl.rows = TEMPLATE_ROWS;
        text.inputEl.addClass('copy-as-prompt-template');
        text
          .setPlaceholder(DEFAULT_SETTINGS.template)
          .setValue(this.host.settings.template)
          .onChange(async (value) => this.persist('template', value));
      });

    // Mobile has no filesystem path to the vault, so nothing here can emit one.
    // Showing the control greyed out with a reason beats silently omitting it,
    // which just reads as a missing feature.
    const hasPaths = vaultContext(this.app) !== null;

    new Setting(containerEl)
      .setName('Path style')
      .setDesc(
        hasPaths
          ? 'Absolute paths work from any directory; vault-relative paths are shorter.'
          : 'Desktop only — this device has no filesystem path to the vault, so the @path commands are hidden.',
      )
      .setDisabled(!hasPaths)
      .addDropdown((dropdown) =>
        dropdown
          .setDisabled(!hasPaths)
          .addOption('absolute', 'Absolute (~/Vault/Note.md)')
          .addOption('vault-relative', 'Vault-relative (Note.md)')
          .setValue(this.host.settings.pathStyle)
          .onChange(async (value) =>
            this.persist('pathStyle', value === 'vault-relative' ? 'vault-relative' : 'absolute'),
          ),
      );

    new Setting(containerEl)
      .setName('Path prefix override')
      .setDesc(
        "Emit paths under this location instead of the vault's real one. Set it when the thing reading these paths sees the vault elsewhere — WSL, a container, or over SSH. Leave empty to use the real path.",
      )
      .addText((text) =>
        text
          .setPlaceholder('/mnt/c/Users/you/Vault')
          .setValue(this.host.settings.pathPrefix)
          .onChange(async (value) => this.persist('pathPrefix', value)),
      );

    this.toggle(
      'includeHeader',
      'Name the source note',
      'Lead the prompt with where it came from.',
    );
    this.toggle(
      'fenceContent',
      'Wrap content in a code fence',
      'Separate the note from your instructions.',
    );
    new Setting(containerEl)
      .setName('Review before copying')
      .setDesc('Show the prompt and its estimated size, and let you edit it, before it is copied.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('never', 'Never')
          .addOption('large', 'Only large prompts')
          .addOption('always', 'Always')
          .setValue(this.host.settings.previewMode)
          .onChange(async (value) => this.persist('previewMode', toPreviewMode(value))),
      );

    new Setting(containerEl)
      .setName('Large means more than')
      .setDesc('Estimated tokens. Only used when reviewing large prompts.')
      .setDisabled(this.host.settings.previewMode !== 'large')
      .addText((text) =>
        text.setValue(String(this.host.settings.previewThreshold)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);

          if (Number.isFinite(parsed) && parsed >= 0)
            await this.persist('previewThreshold', parsed);
        }),
      );

    new Setting(containerEl).setName('Self-contained mode').setHeading();

    new Setting(containerEl)
      .setName('Embed depth')
      .setDesc(
        `How many levels of ![[embeds]] to inline. 0 never inlines. Maximum ${MAX_EMBED_DEPTH}.`,
      )
      .addSlider((slider) =>
        slider
          .setLimits(0, MAX_EMBED_DEPTH, 1)
          .setDynamicTooltip()
          .setValue(this.host.settings.embedDepth)
          .onChange(async (value) => this.persist('embedDepth', value)),
      );

    new Setting(containerEl)
      .setName('Link depth')
      .setDesc(
        `How many hops of [[links]] to follow outward. Paths mode lists what it reaches; self-contained mode includes it. Maximum ${MAX_LINK_DEPTH}.`,
      )
      .addSlider((slider) =>
        slider
          .setLimits(0, MAX_LINK_DEPTH, 1)
          .setDynamicTooltip()
          .setValue(this.host.settings.linkDepth)
          .onChange(async (value) => this.persist('linkDepth', value)),
      );

    new Setting(containerEl).setName('Images').setHeading();

    this.list(
      'imageExtensions',
      'Image extensions',
      'Treated as images rather than generic attachments. Add heic for iPhone screenshots.',
      'png, jpg, heic',
    );

    this.toggle(
      'attachImageFiles',
      'Attach all images in one paste (macOS)',
      'Uses the macOS pasteboard so a single paste attaches every image. Turn off to always copy one at a time.',
    );

    new Setting(containerEl).setName('Never include').setHeading();

    this.list(
      'excludeTags',
      'Tags',
      'Notes carrying these tags are withheld, including from link traversal. Nested tags match too.',
      '#private, #health',
    );
    this.list(
      'excludeFolders',
      'Folders',
      'Notes in these folders are withheld, however they were reached.',
      'Personal, Journal',
    );
    this.list(
      'redactPatterns',
      'Redact patterns',
      'Regular expressions replaced with [redacted] in any included note. An invalid pattern is skipped.',
      String.raw`\d{3}-\d{2}-\d{4}`,
    );

    this.toggle(
      'nameExcluded',
      'Name withheld notes',
      'Show the path of an excluded note beside its placeholder. Off by default, since a filename can be the sensitive part.',
    );

    new Setting(containerEl).setName('CLI command').setHeading();

    new Setting(containerEl)
      .setName('Command')
      .setDesc('The executable the copied command starts with.')
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.cliCommand)
          .setValue(this.host.settings.cliCommand)
          .onChange(async (value) => this.persist('cliCommand', value)),
      );

    this.list(
      'cliForwardKeys',
      'Forward these frontmatter keys',
      'Each listed key becomes --key value. Booleans become bare flags; lists repeat the flag.',
      'model, effort',
    );

    new Setting(containerEl)
      .setName('Always include these arguments')
      .setDesc('Inserted verbatim before the prompt, e.g. -p for a non-interactive run.')
      .addText((text) =>
        text
          .setPlaceholder('-p')
          .setValue(this.host.settings.cliExtraArguments)
          .onChange(async (value) => this.persist('cliExtraArguments', value)),
      );

    this.toggle(
      'cliAddVaultDir',
      'Grant the session access to the vault',
      'Adds a directory flag so @paths resolve when the command runs outside the vault.',
    );

    new Setting(containerEl)
      .setName('Directory flag')
      .setDesc('The flag name granting that access, without dashes.')
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.cliAddDirFlag)
          .setValue(this.host.settings.cliAddDirFlag)
          .onChange(async (value) => this.persist('cliAddDirFlag', value)),
      );

    new Setting(containerEl)
      .setName('Switch to a heredoc above')
      .setDesc(
        'Prompt characters. Command-line limits differ by platform — roughly 256KB on macOS, far more on Linux, far less on Windows.',
      )
      .addText((text) =>
        text.setValue(String(this.host.settings.cliArgumentLimit)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);

          if (Number.isFinite(parsed) && parsed > 0) await this.persist('cliArgumentLimit', parsed);
        }),
      );

    new Setting(containerEl).setName('What to remove').setHeading();

    this.toggle('stripFrontmatter', 'Frontmatter', 'Drop the leading YAML block.');
    this.toggle('stripTags', 'Tags', 'Drop #tags from the prose.');
    this.toggle('stripComments', 'Comments', 'Drop %%Obsidian comments%%, which never render.');
    this.toggle(
      'stripDynamicBlocks',
      'Dataview and Templater',
      'Drop query and template blocks, which paste as unrendered source.',
    );

    new Setting(containerEl).setName('Safety').setHeading();

    new Setting(containerEl)
      .setName('Confirm above this many notes')
      .setDesc('Copying a folder asks first when it holds more notes than this.')
      .addText((text) =>
        text.setValue(String(this.host.settings.folderNoteLimit)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);

          if (Number.isFinite(parsed) && parsed >= 0) await this.persist('folderNoteLimit', parsed);
        }),
      );

    new Setting(containerEl).addButton((button) =>
      button.setButtonText('Restore defaults').onClick(async () => {
        Object.assign(this.host.settings, DEFAULT_SETTINGS);
        await this.host.saveSettings();
        this.display();
      }),
    );
  }
}
