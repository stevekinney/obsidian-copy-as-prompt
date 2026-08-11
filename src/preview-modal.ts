import { Modal, Setting, type App } from 'obsidian';

const PREVIEW_ROWS = 20;

/**
 * Show the prompt before it reaches the clipboard.
 *
 * This is a trust feature more than a convenience one. The plugin decides a lot
 * on your behalf — which links resolve, which notes traversal reached, what got
 * stripped, what an exclusion rule withheld — and all of it is invisible until
 * you have already pasted. Being able to read the thing first, and edit it, is
 * the difference between a tool you use and one you use nervously.
 */
export class PreviewModal extends Modal {
  private value: string;
  private confirmed = false;

  constructor(
    app: App,
    private readonly initial: string,
    private readonly summary: string,
    private readonly onConfirm: (text: string) => void,
  ) {
    super(app);
    this.value = initial;
  }

  override onOpen(): void {
    this.setTitle('Copy as prompt');

    this.contentEl.createEl('p', { text: this.summary }).addClass('copy-as-prompt-summary');

    const area = this.contentEl.createEl('textarea', { cls: 'copy-as-prompt-preview' });

    area.rows = PREVIEW_ROWS;
    area.value = this.initial;
    area.addEventListener('input', () => {
      this.value = area.value;
    });

    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText('Copy')
          .setCta()
          .onClick(() => {
            this.confirmed = true;
            this.close();
          }),
      );
  }

  override onClose(): void {
    this.contentEl.empty();

    // Copy after the modal is gone, so the resulting Notice isn't hidden behind it.
    if (this.confirmed) this.onConfirm(this.value);
  }
}
