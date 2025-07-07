// src/settings/ResolveConfirmation.ts
import { App, Modal, Setting } from 'obsidian';

export class ResolveConfirmation extends Modal {
  private message: string;
  private currentContent: string;
  private offers: any[];            // ← can be string OR object
  private callback: (merged: string) => void;
  private idx = 0;

  constructor(
    app: App,
    message: string,
    currentContent: string,
    offers: any[],                  // accept whatever we get
    callback: (merged: string) => void
  ) {
    super(app);
    this.message = message;
    this.currentContent = currentContent;
    this.offers = offers;
    this.callback = callback;
  }

  onOpen() {
    this.modalEl.style.minWidth = '1200px';
    this.renderStep();
  }

  private renderStep() {
    const { contentEl } = this;
    contentEl.empty();

    /* --- extract collabId + content gracefully --- */
    const raw     = this.offers[this.idx];
    const content =
      typeof raw === 'string' ? raw : raw?.content ?? '';
    const collabId =
      typeof raw === 'string'
        ? '(unknown)'
        : raw?.collabId ?? raw?.sortKey ?? '(unknown)';

    /* --- header --- */
    contentEl.createEl('h2', {
      text: `Offer ${this.idx + 1} of ${this.offers.length} — from ${collabId}`,
    });
    contentEl.createEl('p', { text: this.message });

    /* --- two-column layout --- */
    const container = contentEl.createDiv();
    container.style.display = 'flex';
    container.style.gap = '12px';

    /* Incoming Offer (right pane) */
    const incBox = container.createDiv();
    incBox.style.flex = '1';
    incBox.style.border = '1px solid var(--background-modifier-border)';
    incBox.style.padding = '0.5em';
    incBox.style.overflowY = 'auto';
    incBox.style.maxHeight = '500px';
    incBox.createEl('strong', { text: 'Incoming Offer' });
    const incTA = incBox.createEl('textarea') as HTMLTextAreaElement;
    incTA.value = content;
    incTA.style.width = '100%';
    incTA.style.height = '400px';

    /* Current Master (left pane) */
    const curBox = container.createDiv();
    curBox.style.flex = '1';
    curBox.style.border = '1px solid var(--background-modifier-border)';
    curBox.style.padding = '0.5em';
    curBox.style.overflowY = 'auto';
    curBox.style.maxHeight = '500px';
    curBox.createEl('strong', { text: 'Current Master' });
    const curTA = curBox.createEl('textarea') as HTMLTextAreaElement;
    curTA.value = this.currentContent;
    curTA.readOnly = false;
    curTA.style.width = '100%';
    curTA.style.height = '400px';

    /* Button row */
    const btnRow = new Setting(contentEl);
    btnRow.settingEl.style.justifyContent = 'flex-start';

    btnRow
      .addButton((b) =>
        b.setButtonText('Skip Offer').onClick(() => this.nextOrFinish())
      )
      .addButton((b) =>
        b
          .setButtonText('Update Master')
          .setCta()
          .onClick(() => {
            this.currentContent = curTA.value;
            this.nextOrFinish();
          })
      );
  }

  private nextOrFinish() {
    this.idx++;
    if (this.idx < this.offers.length) {
      this.renderStep();
    } else {
      this.close();
      this.callback(this.currentContent);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
