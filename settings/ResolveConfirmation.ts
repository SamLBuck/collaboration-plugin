// src/settings/ResolveConfirmation.ts
import { App, Modal, Setting } from 'obsidian';

export class ResolveConfirmation extends Modal {
  private message: string;
  private currentContent: string;
  private offers: string[];
  private callback: (mergedContent: string) => void;
  private idx = 0;

  constructor(
    app: App,
    message: string,
    currentContent: string,
    offers: string[],
    callback: (mergedContent: string) => void
  ) {
    super(app);
    this.message = message;
    this.currentContent = currentContent;
    this.offers = offers;
    this.callback = callback;
  }

  onOpen() {
    // make it wider
    this.modalEl.style.minWidth = '1200px';
    this.renderStep();
  }

  private renderStep() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: `Offer ${this.idx + 1} of ${this.offers.length}` });
    contentEl.createEl('p', { text: this.message });

    // two‐column layout
    const container = contentEl.createDiv();
    container.style.display = 'flex';
    container.style.gap = '12px';

    // ── Left pane: current working master (read‐only) ──
    const curBox = container.createDiv();
    curBox.style.flex = '1';
    curBox.style.border = '1px solid var(--background-modifier-border)';
    curBox.style.padding = '0.5em';
    curBox.style.overflowY = 'auto';
    curBox.style.maxHeight = '500px';
    curBox.createEl('strong', { text: 'Current Master' });
    const curTA = curBox.createEl('textarea') as HTMLTextAreaElement;
    curTA.value = this.currentContent;
    curTA.readOnly = true;
    curTA.style.width = '100%';
    curTA.style.height = '400px';

    // ── Right pane: this offer (editable) ──
    const incBox = container.createDiv();
    incBox.style.flex = '1';
    incBox.style.border = '1px solid var(--background-modifier-border)';
    incBox.style.padding = '0.5em';
    incBox.style.overflowY = 'auto';
    incBox.style.maxHeight = '500px';
    incBox.createEl('strong', { text: 'Incoming Offer' });
    const incTA = incBox.createEl('textarea') as HTMLTextAreaElement;
    incTA.value = this.offers[this.idx];
    incTA.style.width = '100%';
    incTA.style.height = '400px';

    // ── Buttons ──
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Accept Offer')
          .setCta()
          .onClick(() => {
            // copy whatever the user has in the right pane into currentContent
            this.currentContent = incTA.value;
            this.nextOrFinish();
          })
      )
      .addButton((btn) =>
        btn.setButtonText('Skip Offer').onClick(() => {
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
      // at the end, hand back the final currentContent
      this.callback(this.currentContent);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
