import { Setting } from 'obsidian';

import { FlagSuggest } from './flag-suggest.js';
import { findFlag } from './known-flags.js';
import { parseList, withEntry, withoutEntry } from './list-field.js';
import { DEFAULT_SETTINGS } from './settings.js';
import type { SettingsSection } from './settings-shared.js';

/**
 * The CLI command settings.
 *
 * Split out of the settings tab purely for size: this section carries the
 * forwarded-key editor, which is the most involved control in the plugin.
 */

/**
 * The forwarded-key list, with autocompletion over the known CLI flags.
 *
 * Typing is still allowed: the catalog is advisory, since the configured
 * command may be a wrapper, a fork, or newer than the list we ship.
 */
function forwardedKeys(section: SettingsSection): void {
  const { containerEl } = section;
  const keys = parseList(section.host.settings.cliForwardKeys);

  new Setting(containerEl)
    .setName('Forward these frontmatter keys')
    .setDesc(
      'Each becomes --key value. A key set to true becomes a bare flag; a list repeats the flag. Start typing to search the known flags.',
    )
    .addText((text) => {
      text.setPlaceholder('Add a flag…');

      new FlagSuggest(
        section.host.app,
        text.inputEl,
        () => parseList(section.host.settings.cliForwardKeys),
        (flag) => {
          void section
            .persist('cliForwardKeys', withEntry(section.host.settings.cliForwardKeys, flag.name))
            .then(() => section.refresh());
        },
      );

      // Typing a name and pressing Enter adds it, known or not.
      text.inputEl.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || !text.getValue().trim()) return;

        event.preventDefault();
        void section
          .persist(
            'cliForwardKeys',
            withEntry(section.host.settings.cliForwardKeys, text.getValue()),
          )
          .then(() => section.refresh());
      });
    });

  if (keys.length === 0) {
    containerEl.createEl('p', {
      text: 'No keys forwarded — frontmatter will not add any flags.',
      cls: 'copy-as-prompt-empty',
    });

    return;
  }

  for (const key of keys) {
    const known = findFlag(key);

    new Setting(containerEl)
      .setName(`--${key}`)
      .setDesc(known ? known.description : 'Not a flag we recognize. It will still be forwarded.')
      .addExtraButton((button) =>
        button
          .setIcon('x')
          .setTooltip('Stop forwarding')
          .onClick(() => {
            void section
              .persist('cliForwardKeys', withoutEntry(section.host.settings.cliForwardKeys, key))
              .then(() => section.refresh());
          }),
      );
  }
}

/** Render the CLI command section. */
export function renderCliSettings(section: SettingsSection): void {
  const { containerEl } = section;

  new Setting(containerEl).setName('CLI command').setHeading();

  new Setting(containerEl)
    .setName('Command')
    .setDesc('The executable the copied command starts with.')
    .addText((text) =>
      text
        .setPlaceholder(DEFAULT_SETTINGS.cliCommand)
        .setValue(section.host.settings.cliCommand)
        .onChange(async (value) => section.persist('cliCommand', value)),
    );

  forwardedKeys(section);

  new Setting(containerEl)
    .setName('Always include these arguments')
    .setDesc('Inserted verbatim before the prompt, e.g. -p for a non-interactive run.')
    .addText((text) =>
      text
        .setPlaceholder('-p')
        .setValue(section.host.settings.cliExtraArguments)
        .onChange(async (value) => section.persist('cliExtraArguments', value)),
    );

  section.toggle(
    'cliAddVaultDir',
    'Grant the session access to the vault',
    'Adds a directory flag so @paths resolve when the command runs outside the vault.',
  );
}
