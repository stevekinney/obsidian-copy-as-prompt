import { Setting } from 'obsidian';

import { toPreviewMode } from './settings.js';
import type { SettingsSection } from './settings-shared.js';

/**
 * When the plugin asks before acting, and where its entries appear.
 *
 * Grouped together because they answer one question — how much does this get in
 * my way — rather than because they touch the same code.
 */
export function renderBehaviorSettings(section: SettingsSection): void {
  const { containerEl, host } = section;

  section.heading('Confirmation and review');

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
    'redactPatterns',
    'Redact patterns',
    'Regular expressions replaced with [redacted] in any included note. An invalid pattern is skipped.',
    String.raw`\d{3}-\d{2}-\d{4}`,
  );
}
