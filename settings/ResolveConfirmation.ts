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
    curTA.readOnly = false;
    curTA.style.width = '100%';
    curTA.style.height = '400px';

// ── Button row (LEFT-aligned) ──
const btnRow = new Setting(contentEl);
btnRow.settingEl.style.justifyContent = 'flex-start';  // push to the left

btnRow
  .addButton((btn) =>
    btn
      .setButtonText('Skip Offer')           // first button
      .onClick(() => this.nextOrFinish())
  )
  .addButton((btn) =>
    btn
      .setButtonText('Update Master')        // blue CTA
      .setCta()
      .onClick(() => {
        this.currentContent = curTA.value;   // keep whatever’s in master
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
