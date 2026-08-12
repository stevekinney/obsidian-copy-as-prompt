import { AbstractInputSuggest, type App } from 'obsidian';

import { matchNames } from './cli-profiles.js';

/**
 * Autocomplete for CLI flag names.
 *
 * A forwarded frontmatter key becomes `--key value`, so a typo produces a
 * command the tool rejects — and you find out in the terminal, not here.
 *
 * The names come from the configured flag list rather than from anything baked
 * in, so this works the same for a tool the plugin has never heard of. Typing
 * an unlisted name is still accepted.
 */
export class FlagSuggest extends AbstractInputSuggest<string> {
  constructor(
    app: App,
    input: HTMLInputElement,
    private readonly available: () => string[],
    private readonly chosen: () => string[],
    private readonly onPick: (name: string) => void,
  ) {
    super(app, input);
  }

  protected override getSuggestions(query: string): string[] {
    return matchNames(query, this.available(), this.chosen());
  }

  override renderSuggestion(name: string, el: HTMLElement): void {
    el.createDiv({ text: `--${name}`, cls: 'copy-as-prompt-flag-name' });
  }

  override selectSuggestion(name: string): void {
    this.onPick(name);
    this.setValue('');
    this.close();
  }
}
