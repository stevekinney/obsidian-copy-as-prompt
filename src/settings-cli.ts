import { Setting } from 'obsidian';

import { CLI_PROFILES, findProfile } from './cli-profiles.js';
import { FlagSuggest } from './flag-suggest.js';
import { parseList, withEntry, withoutEntry } from './list-field.js';
import type { SettingsSection } from './settings-shared.js';

/**
 * The CLI command settings.
 *
 * A profile is only a set of starting values: choosing one writes them into the
 * fields below, which stay editable. Nothing downstream knows which tool is
 * configured, so a wrapper script or a tool that did not exist when this was
 * written is set up exactly the same way as a built-in one.
 */

/** Apply a profile's values to the individual settings. */
async function applyProfile(section: SettingsSection, id: string): Promise<void> {
  const profile = findProfile(id);

  if (!profile) return;

  await section.persist('cliProfile', profile.id);
  await section.persist('cliCommand', profile.command);
  await section.persist('cliSubcommand', profile.subcommand);
  await section.persist('cliAddDirFlag', profile.directoryFlag);
  await section.persist('cliForwardKeys', profile.forwardKeys);
  await section.persist('cliKnownFlags', profile.knownFlags);
  await section.persist('pathStyle', profile.pathStyle);

  section.refresh();
}

/**
 * The forwarded-key list, with autocompletion over the configured flag names.
 *
 * Typing an unlisted name is still allowed — the list is there to save typing
 * and catch typos, not to police what your tool accepts.
 */
function forwardedKeys(section: SettingsSection): void {
  const { containerEl } = section;
  const keys = parseList(section.host.settings.cliForwardKeys);

  new Setting(containerEl)
    .setName('Forward these frontmatter keys')
    .setDesc(
      'Each becomes --key value. A key set to true becomes a bare flag; a list repeats the flag.',
    )
    .addText((text) => {
      text.setPlaceholder('Add a flag…');

      new FlagSuggest(
        section.host.app,
        text.inputEl,
        () => parseList(section.host.settings.cliKnownFlags),
        () => parseList(section.host.settings.cliForwardKeys),
        (name) => {
          void section
            .persist('cliForwardKeys', withEntry(section.host.settings.cliForwardKeys, name))
            .then(() => section.refresh());
        },
      );

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
    new Setting(containerEl).setName(`--${key}`).addExtraButton((button) =>
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
  const { containerEl, host } = section;

  section.heading('CLI command');

  const profile = findProfile(host.settings.cliProfile);

  new Setting(containerEl)
    .setName('Tool')
    .setDesc(
      profile
        ? profile.note
        : 'Pick a tool to fill in the fields below. Everything stays editable afterwards.',
    )
    .addDropdown((dropdown) => {
      for (const option of CLI_PROFILES) dropdown.addOption(option.id, option.name);

      dropdown
        .setValue(host.settings.cliProfile)
        .onChange(async (value) => applyProfile(section, value));
    });

  section.text('cliCommand', 'Command', 'The executable the copied command starts with.', 'claude');
  section.text(
    'cliSubcommand',
    'Subcommand',
    'Inserted between the executable and its flags. Leave empty unless your tool needs one, such as exec.',
    '',
  );

  forwardedKeys(section);

  section.text(
    'cliExtraArguments',
    'Always include these arguments',
    'Inserted verbatim before the prompt, e.g. -p for a non-interactive run.',
    '-p',
  );

  section.toggle(
    'cliAddVaultDir',
    'Point the tool at the vault',
    'Adds the directory flag below, so paths resolve when the command runs elsewhere.',
  );
}
