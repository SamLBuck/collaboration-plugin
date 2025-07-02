import { App, Modal, Setting, ButtonComponent, Notice, TFile } from 'obsidian';
import type MyPlugin from '../main';
import { KeyItem } from '../main';

// --- INLINED: ConfirmationModal class definition ---
class ConfirmationModal extends Modal {
  message: string;
  callback: (confirmed: boolean) => void;

  constructor(app: App, message: string, callback: (confirmed: boolean) => void) {
    super(app);
    this.message = message;
    this.callback = callback;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Confirmation' });
    contentEl.createEl('p', { text: this.message });
    new Setting(contentEl)
      .addButton(btn =>
        btn.setButtonText('Confirm')
          .setCta()
          .setClass('mod-warning')
          .onClick(() => { this.callback(true); this.close(); }))
      .addButton(btn =>
        btn.setButtonText('Cancel')
          .onClick(() => { this.callback(false); this.close(); }));
  }

  onClose() {
    this.contentEl.empty();
  }
}
// --- END ConfirmationModal ---

export class KeyListModal extends Modal {
  plugin: MyPlugin;
  private keyListContainer: HTMLElement;

  constructor(app: App, plugin: MyPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'All Collaboration Keys' });
    this.keyListContainer = contentEl.createDiv({ cls: 'key-list-container' });
    await this.renderKeyListContent(this.keyListContainer);
  }

  onClose() {
    this.contentEl.empty();
  }

  private async renderKeyListContent(container: HTMLElement): Promise<void> {
    container.empty();
    const keys: KeyItem[] = this.plugin.settings.keys;
    if (!keys.length) {
      container.createEl('p', { text: 'No collaboration keys stored.', cls: 'empty-list-message' });
      return;
    }

    // Header row
    const header = container.createDiv({ cls: 'key-list-header' });
    header.style.display = 'grid';
    header.style.gridTemplateColumns = '3fr 1fr 1fr';
    header.createSpan({ text: 'Full Key' });
    header.createSpan({ text: 'File' });
    header.createSpan({ text: 'Actions' });

    // Data rows
    keys.forEach(keyItem => {
      const row = container.createDiv({ cls: 'key-list-row' });
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '3fr 1fr 1fr';

      // Construct display string: noteKey:apiKey|basename
      const basename = keyItem.filePath.split('/').pop() || '';
      const displayKey = `${keyItem.noteKey}:${keyItem.apiKey}|${basename}`;
      row.createDiv({ text: displayKey, cls: ['field-content-box'] });
      row.createDiv({ text: basename, cls: ['field-content-box'] });

      // Actions
      const actions = row.createDiv({ cls: 'key-actions' });

      // Copy full key
      new ButtonComponent(actions)
        .setIcon('copy')
        .setTooltip('Copy full key')
        .onClick(async () => {
          await navigator.clipboard.writeText(displayKey);
          new Notice('Full key copied to clipboard', 2000);
        });

      // Delete key
      new ButtonComponent(actions)
        .setIcon('trash')
        .setWarning()
        .setTooltip('Delete key')
        .onClick(() => {
          new ConfirmationModal(
            this.app,
            `Delete key ${displayKey}?`,
            async confirmed => {
              if (confirmed) {
                this.plugin.settings.keys = this.plugin.settings.keys.filter(
                  k => !(k.noteKey === keyItem.noteKey && k.apiKey === keyItem.apiKey && k.filePath === keyItem.filePath)
                );
                if (this.plugin.settings.activeKey === keyItem.noteKey) {
                  this.plugin.settings.activeKey = undefined;
                }
                await this.plugin.saveSettings();
                new Notice('Key deleted', 2000);
                await this.renderKeyListContent(container);
              } else {
                new Notice('Deletion cancelled', 2000);
              }
            }
          ).open();
        });
    });
  }
}
