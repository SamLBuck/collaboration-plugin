// views/CollaborationPanelView.ts
import {
    App,
    ItemView,
    WorkspaceLeaf,
    ButtonComponent,
    Notice,
    Setting,
    TextComponent,
    setIcon,
    TFile,
    Modal,
  } from 'obsidian';
  import MyPlugin, { KeyItem } from '../main';
  import { parseKey } from '../utils/parse_key';
  import { fetchMaster } from '../utils/api';
  
  class ConfirmationModal extends Modal {
    message: string;
    callback: (confirmed: boolean) => void;
  
    constructor(app: App, message: string, callback: (confirmed: boolean) => void) {
      super(app);
      this.message = message;
      this.callback = callback;
    }
  
    onOpen() {
      this.contentEl.empty();
      this.contentEl.createEl('h2', { text: 'Confirmation' });
      this.contentEl.createEl('p', { text: this.message });
      new Setting(this.contentEl)
        .addButton((btn) =>
          btn
            .setButtonText('Confirm')
            .setCta()
            .setClass('mod-warning')
            .onClick(() => {
              this.callback(true);
              this.close();
            })
        )
        .addButton((btn) =>
          btn.setButtonText('Cancel').onClick(() => {
            this.callback(false);
            this.close();
          })
        );
    }
  
    onClose() {
      this.contentEl.empty();
    }
  }
  
  export const AWS_COLLABORATION_VIEW_TYPE = 'aws-collaboration-panel-view';
  type NoteType = 'none' | 'owner';
  
  export class CollaborationPanelView extends ItemView {
    plugin: MyPlugin;
    activeNoteFile: TFile | null = null;
    noteType: NoteType = 'none';
    noteInput!: TextComponent;
    linkNoteKeyInput!: TextComponent;
    private wrapper!: HTMLDivElement;
    private offersCountEl: HTMLElement | null = null;
    private offersPollId: number | null = null;
  
    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
      super(leaf);
      this.plugin = plugin;
    }
  
    getViewType(): string {
      return AWS_COLLABORATION_VIEW_TYPE;
    }
    getDisplayText(): string {
      return 'Collaboration Panel';
    }
    getIcon(): string {
      return 'columns-3';
    }
  
    async onOpen(): Promise<void> {
      // 1) Wire up events (unchanged)
      this.registerEvent(
        this.app.workspace.on('file-open', async (file) => {
          if (file instanceof TFile) {
            this.activeNoteFile = file;
            this.noteType = await this.determineNoteType(file);
            await this.renderPanelContent();
          }
        })
      );
      this.offersPollId = window.setInterval(async () => {
        if (this.noteType !== 'owner' || !this.activeNoteFile) return;
        const key = this.plugin.settings.keys.find((k) => k.filePath === this.activeNoteFile!.path);
        if (key) await this.refreshOffersDisplay(key.noteKey, key.apiKey);
      }, 10_000);
      this.contentEl.addEventListener('click', this.handleContentClick);
      this.registerEvent(
        this.plugin.events.on('collaboration-key-updated', async () => {
          this.noteType = await this.determineNoteType(this.activeNoteFile);
          await this.renderPanelContent();
        })
      );
  
      // 2) Prime the panel
      this.activeNoteFile = this.app.workspace.getActiveFile();
      this.noteType = await this.determineNoteType(this.activeNoteFile);
  
      // 3) RENDER
      await this.renderPanelContent();
    }
  
    async onClose(): Promise<void> {
      if (this.offersPollId) window.clearInterval(this.offersPollId);
      this.contentEl.removeEventListener('click', this.handleContentClick);
    }
  
    private async determineNoteType(file: TFile | null): Promise<NoteType> {
      if (!file) return 'none';
      return this.plugin.settings.keys.some((k) => k.filePath === file.path) ? 'owner' : 'none';
    }
  
    private async renderPanelContent(): Promise<void> {
      // clear + (re)create the wrapper
      this.contentEl.empty();
      this.wrapper = this.contentEl.createDiv({ cls: 'aws-collab-wrapper' });
  
      // dispatch to owner vs none
      if (this.noteType === 'owner') {
        await this.renderOwnerNotePanel();
      } else {
        this.renderNoneNotePanel();
      }
    }
  
    private renderNoneNotePanel(): void {
      const w = this.wrapper;
      w.createEl('h2', { text: 'Create New Shareable Note' });
      w.createEl('p', { text: 'This note is not currently shared. Generate a new key to share it.' });
  
      new Setting(w)
        .setName('Generate New Key')
        .setDesc('Generate a new collaboration note for this file and copy its key.')
        .addText((t) => {
          this.noteInput = t;
          t.setPlaceholder('Suggest Current Note…').setValue(this.activeNoteFile?.basename || '');
        })
        .addButton((btn) =>
            btn
        .setButtonText('Generate')
        .setCta()
        .onClick(async () => {
          const name = this.noteInput.getValue().trim();
          // … validation …
          if (!this.activeNoteFile) {
            new Notice('No active note file found.', 3000);
            return;
          }
          const newKeyItem = await this.plugin.createCollabNoteWithFile(this.activeNoteFile);
          if (!newKeyItem) return;
      
          // **1**: point the panel at the newly-shared file
          this.activeNoteFile = this.activeNoteFile;
      
          // **2**: mark ourselves as the owner
          this.noteType = 'owner';
      
          // **3**: re-draw the entire view (now owner UI)
          await this.renderPanelContent();
      
          // **4**: copy the key and notify
          const noteName = newKeyItem.filePath.replace(/\.md$/, '');
          const outKey = `${newKeyItem.noteKey}:${newKeyItem.apiKey}|${noteName}`;
          await navigator.clipboard.writeText(outKey);
          new Notice(`New key: ${outKey}`, 8000);
        })
              );
  
      new Setting(w)
        .setName('Pull a Shared Note')
        .setDesc('Enter a key of the form noteKey:apiKey|noteName')
        .addText((t) => {
          this.linkNoteKeyInput = t;
          t.setPlaceholder('ab12cd34-…:myApiKey123|MyNoteName');
        })
        .addButton((btn) =>
          btn
            .setButtonText('Get Note')
            .setCta()
            .onClick(async () => {
              const raw = this.linkNoteKeyInput.getValue().trim();
              const file = await this.handlePullAndLink(raw);
              if (!file) return;
              this.activeNoteFile = file;
              this.noteType = await this.determineNoteType(file);
              await this.renderPanelContent();
            })
        );
    }
  
    private async handlePullAndLink(raw: string): Promise<TFile | void> {
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
        content = await fetchMaster(this.plugin.settings.apiBaseUrl, noteKey, apiKey);
      } catch (e: any) {
        new Notice(`Failed to pull: ${e.message}`, 5000);
        return;
      }
  
      const name = (providedName || noteKey).trim();
      const filePath = `${name}.md`;
      const vault = this.app.vault;
      const existing = vault.getAbstractFileByPath(filePath) as TFile;
  
      if (existing) {
        const ok = await new Promise<boolean>((res) =>
          new ConfirmationModal(this.app, `Overwrite ${filePath}?`, res).open()
        );
        if (!ok) {
          new Notice('Cancelled.', 3000);
          return;
        }
        await vault.modify(existing, content);
      } else {
        await vault.create(filePath, content);
      }
  
      const file = vault.getAbstractFileByPath(filePath) as TFile;
      if (file) {
        await this.app.workspace.getLeaf(true).openFile(file);
      }
  
      // record in settings
      const linkArr = this.plugin.settings.keys;
      if (!linkArr.find((k) => k.noteKey === noteKey && k.apiKey === apiKey && k.filePath === filePath)) {
        linkArr.push({ noteKey, apiKey, filePath });
        this.plugin.settings.activeKey = noteKey;
        await this.plugin.saveSettings();
      }
      return file;
    }
  
    private async renderOwnerNotePanel(): Promise<void> {
      if (!this.activeNoteFile) return;
      const filePath = this.activeNoteFile.path;
      const noteName = this.activeNoteFile.basename;
      const key = this.plugin.settings.keys.find((k) => k.filePath === filePath);
      const w = this.wrapper;
  
      w.createEl('h2', { text: `${noteName} (Collaborator)` });
      if (!key) {
        w.createEl('p', { text: 'Error: Key not found for this note.' });
        return;
      }
  
      const outKey = `${key.noteKey}:${key.apiKey}|${noteName}`;
      new Setting(w)
        .setName('Key')
        .setDesc(outKey)
        .addButton((btn) =>
          btn
            .setButtonText('Copy')
            .setTooltip('Copy collaboration key')
            .onClick(async () => {
              await navigator.clipboard.writeText(outKey);
              new Notice('Copied key to clipboard!', 2000);
            })
        );
  
      new Setting(w)
        .setName('Send Note Changes')
        .setDesc('Sends your changes to your friend')
        .addButton((btn) =>
          btn
            .setButtonText('Send Note Changes')
            .setCta()
            .onClick(() => this.plugin.pushOfferToServer())
        );
  
      new Setting(w)
        .setName('Resolve Conflicts')
        .setDesc('Merge your version with your friend’s before sending')
        .addButton((btn) =>
          btn
            .setButtonText('Resolve Conflicts')
            .setCta()
            .onClick(async () => {
              await this.plugin.resolveMasterNote();
              await this.plugin.pullMasterNote();
              await this.refreshOffersDisplay(key.noteKey, key.apiKey);
              new Notice('Master resolved and updated.', 3000);
            })
        );
  
      new Setting(w)
        .setName('Get Note Changes')
        .setDesc("Pull your friend's newest version")
        .addButton((btn) =>
          btn
            .setButtonText('Get Note Changes')
            .setCta()
            .onClick(() => this.plugin.pullMasterNote())
        );
  
      new Setting(w)
        .setName('Stop Collaboration')
        .setDesc('Remove the collaboration key for this note')
        .addButton((btn) =>
          btn
            .setButtonText('Stop Collaboration')
            .setWarning()
            .onClick(async () => {
              const confirm = await new Promise<boolean>((res) =>
                new ConfirmationModal(this.app, `Delete key for "${noteName}"?`, res).open()
              );
              if (!confirm) return;
              this.plugin.settings.keys = this.plugin.settings.keys.filter((k) => k.filePath !== filePath);
              await this.plugin.saveSettings();
              new Notice(`Key for "${noteName}" deleted.`, 3000);
              this.activeNoteFile = this.app.workspace.getActiveFile();
              this.noteType = await this.determineNoteType(this.activeNoteFile);
              await this.renderPanelContent();
            })
        );
  
      // Offers counter
      this.offersCountEl = w.createEl('p', { text: 'Offers pending: …' });
      await this.refreshOffersDisplay(key.noteKey, key.apiKey);
    }
  
    private async getOffersCount(noteKey: string, apiKey: string): Promise<number> {
      try {
        const url = `${this.plugin.settings.apiBaseUrl}/notes/${noteKey}/offers`;
        const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const offers = (await res.json()) as unknown[];
        return offers.length;
      } catch (err) {
        console.error('[Collab] getOffersCount failed', err);
        return 0;
      }
    }
  
    private async refreshOffersDisplay(noteKey: string, apiKey: string) {
      if (!this.offersCountEl) return;
      const cnt = await this.getOffersCount(noteKey, apiKey);
      this.offersCountEl.textContent = `Offers pending: ${cnt}`;
    }
  
    private handleContentClick = async () => {
      if (this.noteType !== 'owner' || !this.activeNoteFile) return;
      const key = this.plugin.settings.keys.find((k) => k.filePath === this.activeNoteFile!.path);
      if (key) await this.refreshOffersDisplay(key.noteKey, key.apiKey);
    };
  }
  