import { Modal, Setting, type App } from 'obsidian';

/**
 * A yes/no modal, used before a copy that could be enormous.
 *
 * Right-clicking a folder is one keystroke away from concatenating several
 * hundred notes into the clipboard. That is occasionally what you want and
 * usually a misclick, so anything above the configured note limit asks first.
 */
export class ConfirmModal extends Modal {
  private confirmed = false;

  constructor(
    app: App,
    private readonly message: string,
    private readonly onConfirm: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle('Copy as prompt');
    this.contentEl.createEl('p', { text: this.message });

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

    // Run the action after the modal is gone so a Notice isn't hidden behind it.
    if (this.confirmed) this.onConfirm();
  }
}
