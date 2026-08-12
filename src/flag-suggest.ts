import { AbstractInputSuggest, type App } from 'obsidian';

import { matchFlags, type KnownFlag } from './known-flags.js';

/**
 * Autocomplete for CLI flag names.
 *
 * A forwarded frontmatter key becomes `--key value`, so a typo produces a
 * command the CLI rejects — and you find out in the terminal, not here.
 * Suggesting the real names removes most of that.
 *
 * Suggestions are advisory. Anything typed is still accepted, because the
 * configured command may be a wrapper, a fork, or simply newer than the list
 * this ships with.
 */
export class FlagSuggest extends AbstractInputSuggest<KnownFlag> {
  constructor(
    app: App,
    input: HTMLInputElement,
    private readonly chosen: () => string[],
    private readonly onPick: (flag: KnownFlag) => void,
  ) {
    super(app, input);
  }

  protected override getSuggestions(query: string): KnownFlag[] {
    return matchFlags(query, this.chosen());
  }

  override renderSuggestion(flag: KnownFlag, el: HTMLElement): void {
    el.createDiv({ text: flag.name, cls: 'copy-as-prompt-flag-name' });
    el.createDiv({
      text: flag.takesValue ? flag.description : `${flag.description} (no value)`,
      cls: 'copy-as-prompt-flag-description',
    });
  }

  override selectSuggestion(flag: KnownFlag): void {
    this.onPick(flag);
    this.setValue('');
    this.close();
  }
}
