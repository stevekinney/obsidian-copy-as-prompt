import { Setting } from 'obsidian';

import { toMenuModes, toPreviewMode } from './settings.js';
import type { SettingsSection } from './settings-shared.js';

/**
 * When the plugin asks before acting, and where its entries appear.
 *
 * Grouped together because they answer one question — how much does this get in
 * my way — rather than because they touch the same code.
 */
export function renderBehaviorSettings(section: SettingsSection): void {
  const { containerEl, host } = section;

  section.heading('Menus and confirmation');

  new Setting(containerEl)
    .setName('Context menu entries')
    .setDesc(
      'Which output modes appear on right-click menus. Commands stay in the palette either way, so hotkeys keep working.',
    )
    .addDropdown((dropdown) =>
      dropdown
        .addOption('both', 'Both modes')
        .addOption('paths', 'Only @paths')
        .addOption('self-contained', 'Only self-contained')
        .setValue(host.settings.menuModes)
        .onChange(async (value) => {
          await section.persist('menuModes', toMenuModes(value));
        }),
    );

  new Setting(containerEl)
    .setName('Review before copying')
    .setDesc('Show the prompt and its estimated size, and let you edit it, before it is copied.')
    .addDropdown((dropdown) =>
      dropdown
        .addOption('never', 'Never')
        .addOption('large', 'Only large prompts')
        .addOption('always', 'Always')
        .setValue(host.settings.previewMode)
        .onChange(async (value) => {
          await section.persist('previewMode', toPreviewMode(value));
          // The threshold below only exists for one of these choices, so the
          // tab re-renders rather than leaving a dead field on screen.
          section.refresh();
        }),
    );

  if (host.settings.previewMode === 'large') {
    section.number('previewThreshold', 'Large means more than', 'Estimated tokens.', 0);
  }

  section.number(
    'folderNoteLimit',
    'Confirm above this many notes',
    'Copying a folder or a multi-selection asks first when it holds more notes than this.',
    0,
  );
}

/**
 * Settings most people never touch.
 *
 * Kept out of the sections above so those stay short. Each of these exists for
 * a specific, uncommon situation rather than as a preference.
 */
export function renderAdvancedSettings(section: SettingsSection): void {
  section.heading('Advanced');

  section.text(
    'pathPrefix',
    'Path prefix override',
    "Emit paths under this location instead of the vault's real one. For when whatever reads them sees the vault elsewhere — WSL, a container, or over SSH. Empty uses the real path.",
    '/mnt/c/Users/you/Vault',
  );

  section.list(
    'imageExtensions',
    'Image extensions',
    'Treated as images rather than generic attachments. Add heic for iPhone screenshots.',
    'png, jpg, heic',
  );

  section.list(
    'redactPatterns',
    'Redact patterns',
    'Regular expressions replaced with [redacted] in any included note. An invalid pattern is skipped.',
    String.raw`\d{3}-\d{2}-\d{4}`,
  );

  section.text(
    'cliAddDirFlag',
    'CLI directory flag',
    'The flag that grants or sets directory access, without dashes. Claude Code uses add-dir; Codex uses cd.',
    'add-dir',
  );

  section.list(
    'cliKnownFlags',
    'CLI flag names',
    "Offered by autocompletion when forwarding frontmatter keys. Paste more from your tool's --help.",
    'model, effort',
  );

  section.number(
    'cliArgumentLimit',
    'Switch to a heredoc above',
    'Prompt characters. Command-line limits differ by platform — roughly 256KB on macOS, far more on Linux, far less on Windows.',
    1,
  );
}
