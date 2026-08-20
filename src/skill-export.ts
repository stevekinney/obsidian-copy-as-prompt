import { Modal, Notice, Setting, TFile, type App } from 'obsidian';

import { writeText } from './clipboard.js';
import { fileExistsOnDisk, writeFileEnsuringDirectory } from './desktop.js';
import { parseLines, parseList } from './list-field.js';
import { render } from './render.js';
import type { PluginSettings } from './settings.js';
import { serializeSkillFile } from './skill-file.js';
import { parseSkillFrontmatter, toSkillRecord } from './skill-frontmatter.js';
import { validateSkill, type SkillIssue } from './skill-validation.js';
import { isFileExcluded, resolveNote, vaultContext, type ResolveOptions } from './vault.js';

/**
 * Building and delivering a note as a `SKILL.md` — export to disk or copy to
 * the clipboard.
 *
 * The body is the note rendered through the same pipeline every other copy
 * uses (wikilinks become `@` paths, comments/Dataview/Templater stripped per
 * settings), with frontmatter always stripped and the header/fence always
 * off, since the skill frontmatter takes their place. Validation errors
 * block delivery; warnings don't.
 */

type SkillBuild = { contents: string; name: string; issues: SkillIssue[] };

async function renderSkillBody(
  app: App,
  file: TFile,
  settings: PluginSettings,
): Promise<{ body: string; redactPatterns: readonly string[] } | null> {
  const context = vaultContext(app);

  if (!context) {
    new Notice('This plugin needs the desktop app, where the vault has a filesystem path');

    return null;
  }

  const exclusions = {
    tags: parseList(settings.excludeTags),
    folders: parseList(settings.excludeFolders),
    patterns: parseLines(settings.redactPatterns),
  };

  if (isFileExcluded(app, file, exclusions)) {
    new Notice('That note is excluded by your rules');

    return null;
  }

  const resolveOptions: ResolveOptions = {
    context,
    pathStyle: settings.pathStyle,
    stripFrontmatter: true,
    stripTags: settings.stripTags,
    linkDepth: settings.linkDepth,
    exclusions,
  };

  const note = await resolveNote(app, file, resolveOptions);

  const body = render([note], {
    template: '{{content}}',
    fenceContent: false,
    includeHeader: false,
    stripComments: settings.stripComments,
    stripDynamicBlocks: settings.stripDynamicBlocks,
    nameExcluded: settings.nameExcluded,
    redactPatterns: exclusions.patterns,
  });

  return { body, redactPatterns: exclusions.patterns };
}

/** Build the `SKILL.md` contents and validate them, or null when the note can't be rendered. */
async function buildSkillFile(
  app: App,
  file: TFile,
  settings: PluginSettings,
): Promise<SkillBuild | null> {
  const rendered = await renderSkillBody(app, file, settings);

  if (!rendered) return null;

  const cache = app.metadataCache.getFileCache(file);
  const parsed = parseSkillFrontmatter(cache?.frontmatter);
  const issues = validateSkill(parsed.frontmatter, rendered.body);
  const contents = serializeSkillFile(toSkillRecord(parsed), rendered.body);
  const name = parsed.frontmatter.name ?? file.basename;

  return { contents, name, issues };
}

/** Report the first blocking error, if any. Warnings surface too, but don't block. */
function reportIssues(issues: SkillIssue[]): boolean {
  for (const issue of issues) {
    if (issue.severity === 'warning') new Notice(`Skill warning: ${issue.message}`);
  }

  const errors = issues.filter((issue) => issue.severity === 'error');

  if (errors.length === 0) return false;

  const summary =
    errors.length === 1
      ? errors[0]?.message
      : `${errors.length} errors, starting with ${errors[0]?.message}`;

  new Notice(`Can't deliver this skill: ${summary}`);

  return true;
}

/** Copy a note as a `SKILL.md` to the clipboard. */
export async function copySkill(app: App, file: TFile, settings: PluginSettings): Promise<void> {
  const built = await buildSkillFile(app, file, settings);

  if (!built || reportIssues(built.issues)) return;

  const ok = await writeText(built.contents);

  new Notice(ok ? 'Copied skill to clipboard' : 'Could not write to the clipboard');
}

async function writeExport(path: string, contents: string): Promise<void> {
  const ok = await writeFileEnsuringDirectory(path, contents);

  new Notice(ok ? `Exported skill to ${path}` : `Could not write to ${path}`);
}

/** A yes/no modal shown only when export would overwrite an existing `SKILL.md`. */
class OverwriteModal extends Modal {
  private confirmed = false;

  constructor(
    app: App,
    private readonly path: string,
    private readonly onConfirm: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle('Export note as skill');
    this.contentEl.createEl('p', { text: `${this.path} already exists. Overwrite it?` });

    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText('Overwrite')
          .setWarning()
          .onClick(() => {
            this.confirmed = true;
            this.close();
          }),
      );
  }

  override onClose(): void {
    this.contentEl.empty();

    if (this.confirmed) this.onConfirm();
  }
}

/** Export a note as `<skillExportFolder>/<name>/SKILL.md`. */
export async function exportSkill(app: App, file: TFile, settings: PluginSettings): Promise<void> {
  const folder = settings.skillExportFolder.trim();

  if (!folder) {
    new Notice('Set a skill export folder in settings first');

    return;
  }

  const built = await buildSkillFile(app, file, settings);

  if (!built || reportIssues(built.issues)) return;

  const path = `${folder.replace(/\/+$/, '')}/${built.name}/SKILL.md`;

  if (await fileExistsOnDisk(path)) {
    new OverwriteModal(app, path, () => void writeExport(path, built.contents)).open();

    return;
  }

  await writeExport(path, built.contents);
}
