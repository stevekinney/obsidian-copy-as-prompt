import { Setting } from 'obsidian';

import { MAX_EMBED_DEPTH, MAX_LINK_DEPTH } from './settings.js';
import type { SettingsSection } from './settings-shared.js';

const TEMPLATE_ROWS = 6;

/**
 * The settings that decide what a prompt contains.
 *
 * Ordered by the question being asked rather than by when each was added:
 * what the prompt looks like, how much gets pulled in, and what never makes it
 * in. Anything rarely touched lives in the Advanced section at the bottom of
 * the tab instead of competing for attention here.
 */

/** What the prompt looks like. */
export function renderPromptSettings(section: SettingsSection): void {
  section.heading('The prompt');

  new Setting(section.containerEl)
    .setName('Template')
    .setDesc('Use {{title}}, {{path}}, and {{content}} as placeholders.')
    .addTextArea((text) => {
      text.inputEl.rows = TEMPLATE_ROWS;
      text.inputEl.addClass('copy-as-prompt-template');
      text
        .setValue(section.host.settings.template)
        .onChange(async (value) => section.persist('template', value));
    });

  section.toggle(
    'includeHeader',
    'Name the source note',
    'Lead the prompt with where it came from.',
  );
  section.toggle(
    'fenceContent',
    'Wrap content in a code fence',
    'Separate the note from your instructions.',
  );
}

/** How far beyond the note itself to reach. */
export function renderContextSettings(section: SettingsSection): void {
  section.heading('How much to include');

  new Setting(section.containerEl)
    .setName('Link depth')
    .setDesc(
      `How many hops of [[links]] to follow. Paths mode lists what it reaches; self-contained mode includes it whole. Maximum ${MAX_LINK_DEPTH}.`,
    )
    .addSlider((slider) =>
      slider
        .setLimits(0, MAX_LINK_DEPTH, 1)
        .setDynamicTooltip()
        .setValue(section.host.settings.linkDepth)
        .onChange(async (value) => section.persist('linkDepth', value)),
    );

  new Setting(section.containerEl)
    .setName('Embed depth')
    .setDesc(
      `How many levels of ![[embeds]] to inline. Self-contained mode only — paths mode points at them instead. Maximum ${MAX_EMBED_DEPTH}.`,
    )
    .addSlider((slider) =>
      slider
        .setLimits(0, MAX_EMBED_DEPTH, 1)
        .setDynamicTooltip()
        .setValue(section.host.settings.embedDepth)
        .onChange(async (value) => section.persist('embedDepth', value)),
    );
}

/** Whole notes that must never appear, however they were reached. */
export function renderPrivacySettings(section: SettingsSection): void {
  section.heading('Never include these notes');

  section.list(
    'excludeTags',
    'Tags',
    'Notes carrying these tags are withheld, including from link traversal. Nested tags match too.',
    '#private, #health',
  );
  section.list(
    'excludeFolders',
    'Folders',
    'Notes in these folders are withheld, however they were reached.',
    'Personal, Journal',
  );
  section.toggle(
    'nameExcluded',
    'Name withheld notes',
    'Show the path of a withheld note beside its placeholder. Off by default, since a filename can be the sensitive part.',
  );
}

/** Parts of an included note that should be dropped. */
export function renderCleanupSettings(section: SettingsSection): void {
  section.heading('Strip from each note');

  section.toggle('stripFrontmatter', 'Frontmatter', 'Drop the leading YAML block.');
  section.toggle('stripTags', 'Tags', 'Drop #tags from the prose.');
  section.toggle('stripComments', 'Comments', 'Drop %%Obsidian comments%%, which never render.');
  section.toggle(
    'stripDynamicBlocks',
    'Dataview and Templater',
    'Drop query and template blocks, which paste as unrendered source.',
  );
}

/** How paths and images are handled. */
export function renderFileSettings(section: SettingsSection): void {
  section.heading('Paths and images');

  new Setting(section.containerEl)
    .setName('Path style')
    .setDesc('How @paths are written. Absolute works from any directory.')
    .addDropdown((dropdown) =>
      dropdown
        .addOption('absolute', 'Absolute with ~ (~/Vault/Note.md)')
        .addOption('absolute-full', 'Absolute in full (/Users/you/Vault/Note.md)')
        .addOption('vault-relative', 'Vault-relative (Note.md)')
        .setValue(section.host.settings.pathStyle)
        .onChange(async (value) =>
          section.persist(
            'pathStyle',
            value === 'vault-relative' || value === 'absolute-full' ? value : 'absolute',
          ),
        ),
    );

  section.toggle(
    'attachImageFiles',
    'Attach all images in one paste',
    'macOS only. Off copies them one at a time instead.',
  );
}
