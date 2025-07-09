// views/LinkNoteModal.ts
import {
  App,
  Modal,
  Setting,
  TextComponent,
  ButtonComponent,
  Notice,
  TFile
} from 'obsidian';
import type MyPlugin from '../main';
import { KeyItem } from '../main';
import { fetchMaster } from '../utils/api';

class ConfirmationModal extends Modal {
  private message: string;
  private callback: (ok: boolean) => void;

  constructor(app: App, message: string, callback: (ok: boolean) => void) {
    super(app);
    this.message = message;
    this.callback = callback;
  }

  onOpen() {
    this.contentEl.empty();
    this.contentEl.createEl('h2', { text: 'Confirm' });
    this.contentEl.createEl('p', { text: this.message });
    new Setting(this.contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Yes')
          .setWarning()
          .onClick(() => {
            this.callback(true);
            this.close();
          })
      )
      .addButton((btn) =>
        btn.setButtonText('No').onClick(() => {
          this.callback(false);
          this.close();
        })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

export class LinkNoteModal extends Modal {
  private plugin: MyPlugin;
  private keyInput!: TextComponent;
  private listContainer!: HTMLElement;
  private wrapper!: HTMLDivElement;

  constructor(app: App, plugin: MyPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    // 1) clear previous
    this.contentEl.empty();
    // 2) create AWS-scoped wrapper
    this.wrapper = this.contentEl.createDiv({ cls: 'aws-collab-wrapper' });

    // Title & instructions
    this.wrapper.createEl('h2', { text: 'Link Collaborative Note' });
    this.wrapper.createEl('p', {
      text:
        'Enter a collaboration key in the form noteKey:apiKey|noteName to pull and link a note.'
    });

    // Key entry
    new Setting(this.wrapper)
      .setName('Collaboration Key')
      .setDesc('Format: noteKey:apiKey|noteName')
      .addText((text) => {
        this.keyInput = text;
        text.setPlaceholder('e.g. 1ba4dd0f-...:58a378e4-...|MyNote');
      });

    // Pull & Link button
    new Setting(this.wrapper).addButton((btn) =>
      btn
        .setButtonText('Pull & Link')
        .setCta()
        .onClick(() => this.handlePullAndLink())
    );

    // List of linked keys
    this.wrapper.createEl('h3', { text: 'My Linked Keys' });
    this.listContainer = this.wrapper.createDiv({
      cls: 'linked-keys-container'
    });
    this.renderLinkedList();
  }

  onClose() {
    this.contentEl.empty();
  }

  private async handlePullAndLink() {
    const raw = this.keyInput.getValue().trim();
    if (!raw) {
      new Notice('Please enter a collaboration key first.', 3000);
      return;
    }
    const [rawKey, providedName] = raw.split('|');
    const [noteKey, ...apiParts] = rawKey.split(':');
    const apiKey = apiParts.join(':');
    if (!noteKey || !apiKey) {
      new Notice('Invalid format. Use noteKey:apiKey|noteName', 4000);
      return;
    }

    let content: string;
    try {
      content = await fetchMaster(
        this.plugin.settings.apiBaseUrl,
        noteKey,
        apiKey
      );
    } catch (err: any) {
      console.error('[LinkNoteModal] fetchMaster error', err);
      new Notice(`Failed to pull: ${err.message}`, 5000);
      return;
    }

    const name = (providedName || noteKey).trim();
    const filePath = `${name}.md`;
    const vault = this.app.vault;
    const existing = vault.getAbstractFileByPath(
      filePath
    ) as TFile | null;

    if (existing) {
      const ok = await new Promise<boolean>((resolve) =>
        new ConfirmationModal(
          this.app,
          `File "${filePath}" already exists. Overwrite?`,
          resolve
        ).open()
      );
      if (!ok) {
        new Notice('Operation cancelled.', 3000);
        return;
      }
      await vault.modify(existing, content);
    } else {
      await vault.create(filePath, content);
    }

    const file = vault.getAbstractFileByPath(filePath) as TFile | null;
    if (file) {
      await this.app.workspace.getLeaf(true).openFile(file);
      new Notice(`Pulled and opened ${file.basename}`, 3000);
    }

    // record in linkedKeys & keys
    this.plugin.settings.linkedKeys = this.plugin.settings.linkedKeys || [];
    const linked = this.plugin.settings.linkedKeys;
    const keys = this.plugin.settings.keys || [];

    if (
      !linked.find(
        (k) =>
          k.noteKey === noteKey &&
          k.apiKey === apiKey &&
          k.filePath === filePath
      )
    ) {
      linked.push({ noteKey, apiKey, filePath } as KeyItem);
      keys.push({ noteKey, apiKey, filePath } as KeyItem);
      this.plugin.settings.activeKey = noteKey;
      await this.plugin.saveSettings();
      this.plugin.events.trigger('collaboration-key-updated');
    }

    this.renderLinkedList();
    this.close();
  }

  private renderLinkedList() {
    this.listContainer.empty();
    const linked = this.plugin.settings.linkedKeys || [];

    if (!linked.length) {
      this.listContainer.createEl('p', {
        text: 'No linked keys yet.',
        cls: 'empty-list-message'
      });
      return;
    }

    // Header
    const header = this.listContainer.createDiv({
      cls: 'linked-header'
    });
    header.style.display = 'grid';
    header.style.gridTemplateColumns = '3fr 1fr 1fr';
    header.createSpan({ text: 'Full Key' });
    header.createSpan({ text: 'File' });
    header.createSpan({ text: 'Actions' });

    // Rows
    linked.forEach((item) => {
      const row = this.listContainer.createDiv({
        cls: 'linked-row'
      });
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '3fr 1fr 1fr';

      const displayKey = `${item.noteKey}:${item.apiKey}|${item.filePath.replace(
        /\.md$/,
        ''
      )}`;
      row.createDiv({
        text: displayKey,
        cls: 'field-content-box'
      });
      row.createDiv({
        text: item.filePath,
        cls: 'field-content-box'
      });

      const actions = row.createDiv({ cls: 'linked-actions' });

      new ButtonComponent(actions)
        .setIcon('copy')
        .setTooltip('Copy full key')
        .onClick(async () => {
          await navigator.clipboard.writeText(displayKey);
          new Notice('Full key copied');
        });

      new ButtonComponent(actions)
        .setIcon('trash')
        .setWarning()
        .setTooltip('Remove key')
        .onClick(async () => {
          this.plugin.settings.linkedKeys =
            this.plugin.settings.linkedKeys!.filter(
              (k) =>
                !(
                  k.noteKey === item.noteKey &&
                  k.apiKey === item.apiKey &&
                  k.filePath === item.filePath
                )
            );
          if (this.plugin.settings.activeKey === item.noteKey) {
            this.plugin.settings.activeKey = undefined;
          }
          await this.plugin.saveSettings();
          this.renderLinkedList();
        });
    });
  }
}
