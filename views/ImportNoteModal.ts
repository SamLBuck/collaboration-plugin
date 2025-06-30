import { App, Modal, Notice, Setting } from 'obsidian';

export type ImportCallback = (noteKey: string, apiKey: string) => void;

export class ImportNoteModal extends Modal {
  private noteKeyInput: HTMLInputElement;
  private apiKeyInput: HTMLInputElement;
  private callback: ImportCallback;

  constructor(app: App, callback: ImportCallback) {
    super(app);
    this.callback = callback;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.style.minWidth = '500px';

    contentEl.createEl('h2', { text: 'Import Collaboration Note' });

    new Setting(contentEl)
      .setName('Note Key')
      .setDesc('Paste the noteKey you were given')
      .addText(txt => {
        this.noteKeyInput = txt.inputEl;
        txt.setPlaceholder('e.g. 5d5be509-7bb8-...');
      });

    new Setting(contentEl)
      .setName('API Key')
      .setDesc('Paste the x-api-key for that note')
      .addText(txt => {
        this.apiKeyInput = txt.inputEl;
        txt.setPlaceholder('e.g. 579920e2-d3d5-4...');
      });

    new Setting(contentEl)
      .addButton(btn =>
        btn
          .setButtonText('Import')
          .setCta()
          .onClick(() => {
            const nk = this.noteKeyInput.value.trim();
            const ak = this.apiKeyInput.value.trim();
            if (!nk || !ak) {
              // simple validation
              new Notice('Both fields are required', 2000);
              return;
            }
            this.close();
            this.callback(nk, ak);
          })
      )
      .addButton(btn =>
        btn
          .setButtonText('Cancel')
          .onClick(() => {
            this.close();
          })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}
