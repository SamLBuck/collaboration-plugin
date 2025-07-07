// views/CollaborationPanelView.ts
import { App, ItemView, WorkspaceLeaf, ButtonComponent, Notice, Setting, TextComponent, setIcon, TFile, Modal } from 'obsidian';
import MyPlugin, { KeyItem } from '../main';
//import { requestNoteFromPeer } from '../networking/socket/client';

import { parseKey } from '../utils/parse_key';
import { fetchMaster } from '../utils/api';

// --- INLINED: ConfirmationModal class definition (consistent with other views) ---
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
            .addButton(button => {
                button.setButtonText('Confirm').setCta().setClass('mod-warning').onClick(() => {
                    this.callback(true);
                    this.close();
                });
            })
            .addButton(button => {
                button.setButtonText('Cancel').onClick(() => {
                    this.callback(false);
                    this.close();
                });
            });
    }
    onClose() {
        this.contentEl.empty();
    }
}
// --- END INLINED: ConfirmationModal class definition ---

export const COLLABORATION_VIEW_TYPE = 'collaboration-panel-view';

// Define types for note categorization with new names
type NoteType = 'none' | 'owner'; // CHANGED: 'push' to 'owner', 'pulled' to 'collaborator'

export class CollaborationPanelView extends ItemView {
    getViewType(): string {
        return COLLABORATION_VIEW_TYPE
    }
    plugin: MyPlugin;
    activeNoteFile: TFile | null = null;
    noteType: NoteType = 'none';

    noteInput: TextComponent;
    linkNoteKeyInput: TextComponent; // Added missing property

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }


    getDisplayText(): string {
        return 'Collaboration Panel';
    }

    getIcon(): string {
        return 'share';
    }

    async onOpen(): Promise<void> {
        this.registerEvent(
            this.app.workspace.on("file-open", async (file) => {
              if (file instanceof TFile) {
                this.activeNoteFile = file;
                this.noteType       = await this.determineNoteType(file);
                await this.renderPanelContent();
              }
            })
          );

          this.registerEvent(
            this.plugin.events.on('collaboration-key-updated', async () => {
                this.noteType = await this.determineNoteType(this.activeNoteFile);
                await this.renderPanelContent();
            })
        );
            
          // prime the panel
          this.activeNoteFile = this.app.workspace.getActiveFile();
          this.noteType       = await this.determineNoteType(this.activeNoteFile);
          await this.renderPanelContent();
        }
        
    async onClose(): Promise<void> {
        console.log('Collaboration Panel View closed');
    }

    private async determineNoteType(file: TFile | null): Promise<NoteType> {
        if (!file) return 'none';
        return this.plugin.settings.keys.some(k => k.filePath === file.path)
          ? 'owner'
          : 'none';
      }
            
    //   private async renderPanelContent(): Promise<void> {
    //     // 1) grab the latest file
    //     this.activeNoteFile = this.app.workspace.getActiveFile();
    //     // 2) recompute its type
    //     this.noteType       = await this.determineNoteType(this.activeNoteFile);
      
    //     // 3) clear & redraw
    //     this.contentEl.empty();
      
    //     this.contentEl.createEl('h1', { text: `Control Panel` });
        
    //     let displayNoteTypeName: string;
    //     switch (this.noteType) {
    //         case 'none':
    //             displayNoteTypeName = 'None';
    //             break;
    //         case 'owner': // CHANGED: 'push' to 'owner'
    //             displayNoteTypeName = 'Owner'; // CHANGED: 'Push' to 'Owner'
    //             break;
    //         default:
    //             displayNoteTypeName = 'Unknown';
    //     }

    //     this.contentEl.createEl('hr');

    //     switch (this.noteType) {
    //         case 'owner': // CHANGED: 'push' to 'owner'
    //             this.renderOwnerNotePanel(); // CHANGED: renderPushNotePanel to renderOwnerNotePanel
    //             break;
    //         case 'none':
    //         default:
    //             this.renderNoneNotePanel();
    //             break;
    //     }

    //     // this.renderNavigationButtons();
    //     // this.renderAutomaticUpdatesSection();
    // }
    private async renderPanelContent(): Promise<void> {
        if (!this.activeNoteFile) return;
        this.contentEl.empty();
        this.noteType = await this.determineNoteType(this.activeNoteFile);
      
        if (this.noteType === 'owner') {
          await this.renderOwnerNotePanel();
        } else {
          this.renderNoneNotePanel();
        }
      }
      

    private renderNoneNotePanel(): void {
        this.contentEl.createEl('h2', { text: 'Create New Shareable Note' });
        this.contentEl.createEl('p', { text: 'This note is not currently shared. Generate a new key to share it.' });
        
        new Setting(this.contentEl)
        .setName('Generate New Key')
        .setDesc('Generate a new collaboration note for this file and copy its key.')
        .addButton(button =>
          button
            .setButtonText('Generate')
            .onClick(async () => {

                const name = this.noteInput.getValue().trim();
                if (!name) {
                  new Notice('Please enter a note name.', 4000);
                  return;
                }
        
              // 1) Create & bind a new note remotely
              const file = this.app.vault.getAbstractFileByPath(`${name}.md`) as TFile;
              if (!file) {
                new Notice(`File "${name}" not found. Please ensure the file exists.`, 4000);
                return;
              }
              const newKeyItem = await this.plugin.createCollabNoteWithFile(file);
              if (!newKeyItem) {
                // creation failed or was cancelled
                return;
              }
              const noteName = newKeyItem.filePath.replace(/\.md$/, '');
              const outKey = `${newKeyItem.noteKey}:${newKeyItem.apiKey}|${noteName}`;
      
              new Notice(`New key: ${outKey}`, 8000);
              await navigator.clipboard.writeText(outKey);
              
      
              await this.renderPanelContent();
            })
            .setCta() 

        );
      
        new Setting(this.contentEl)
            .setName('Note')
            .setDesc('The note this key will be associated with.')
            .addText(text => {
                this.noteInput = text;
                text.setPlaceholder('Suggest Current Note...')
                    .setValue(this.app.workspace.getActiveFile()?.basename || '');
            })
            .addButton(button => {
                button.setIcon('refresh-cw')
                    .setTooltip('Suggest Current Note')
                    .onClick(() => {
                        this.noteInput.setValue(this.app.workspace.getActiveFile()?.basename || '');
                        new Notice('Suggested current note!');
                    });
            });
            


                this.contentEl.createEl('p', { text: 'pull a shared note from a peer using a key.' });
        
                new Setting(this.contentEl)
                .setName('Pull Collaboration Note')
                .setDesc('Enter a key of the form noteKey:apiKey|noteName to pull.')
                .addText(text => {
                  this.linkNoteKeyInput = text;
                  text.setPlaceholder('e.g., ab12cd34-…:myApiKey123|MyNoteName');
                })
                .addButton(btn =>
                  btn
                    .setButtonText('Pull & Link')
                    .setCta()
                    .onClick(async () => {
                      const raw = this.linkNoteKeyInput.getValue().trim();
                      const file = await this.handlePullAndLink(raw);
                      if (!file) return;
              
                      // 2) Point the panel at that new file
                      this.activeNoteFile = file;
                      this.noteType = await this.determineNoteType(file);
              
                      // 3) Redraw the whole view
                      await this.renderPanelContent();
                    })
                );

              }
              
              // 2) Updated handlePullAndLink signature
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
              
                // fetch from server
                let content: string;
                try {
                  content = await fetchMaster(this.plugin.settings.apiBaseUrl, noteKey, apiKey);
                } catch (e: any) {
                  new Notice(`Failed to pull: ${e.message}`, 5000);
                  return;
                }
              
                // determine file path
                const name = (providedName || noteKey).trim();
                const filePath = `${name}.md`;
                const vault = this.app.vault;
                const existing = vault.getAbstractFileByPath(filePath) as TFile;
              
                // confirm overwrite
                if (existing) {
                  const ok = await new Promise<boolean>(res =>
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
              
                // open the new note
                const file = vault.getAbstractFileByPath(filePath) as TFile;
                if (file) {
                  await this.app.workspace.getLeaf(true).openFile(file);
                }
              
                // record in linkedKeys & activate
                this.plugin.settings.linkedKeys = this.plugin.settings.linkedKeys || [];
                const linked = this.plugin.settings.linkedKeys;
                if (!linked.find(k => k.noteKey === noteKey && k.apiKey === apiKey && k.filePath === filePath)) {
                  linked.push({ noteKey, apiKey, filePath });
                  this.plugin.settings.activeKey = noteKey;
                  await this.plugin.saveSettings();
                }
                this.plugin.settings.keys = this.plugin.settings.keys || [];
                const link = this.plugin.settings.keys;
                if(!link.find(k => k.noteKey === noteKey && k.apiKey === apiKey && k.filePath === filePath)) {
                    link.push({ noteKey, apiKey, filePath });
                    this.plugin.settings.activeKey = noteKey;
                    await this.plugin.saveSettings();
                }
      return file;
    }

    // CHANGED: Renamed from renderPushNotePanel to renderOwnerNotePanel

    // CHANGED: Renamed from renderPushNotePanel to renderOwnerNotePanel
    private renderOwnerNotePanel(): void {
        if (!this.activeNoteFile) return;
        const filePath = this.activeNoteFile.path;
        const noteName = this.activeNoteFile.basename;
      
        // find once by full path
        const key = this.plugin.settings.keys.find(k => k.filePath === filePath);
      
        this.contentEl.createEl('p', {
          text: `${noteName} has a key associated with it. You are a collaborator.`
        });
      
        if (!key) {
          this.contentEl.createEl('p', { text: 'Error: Key not found for this note.' });
          return;
        }
        const outKey = `${key.noteKey}:${key.apiKey}|${noteName}`;
        new Setting(this.contentEl)
          .setName('Key')
          .setDesc(outKey)
          .addButton(btn =>
            btn
              .setIcon('copy')
              .setTooltip('Copy collaboration key')
              .onClick(async () => {
                await navigator.clipboard.writeText(outKey);
                new Notice('Copied key to clipboard!', 2000);
              })
          );
                    
        // DELETE
      
        // PUSH OFFER
        new Setting(this.contentEl)
          .setName('Send Note Changes')
          .setDesc('Sends your changes to your friend')
          .addButton(btn =>
            btn.setButtonText('Send Note Changes').onClick(() => this.plugin.pushOfferToServer())
            .setCta() 
          );
            
        // RESOLVE
        new Setting(this.contentEl)
          .setName('Resolve Conflicts')
          .setDesc('Fix any differences between your version and friend\'s/friends\' so you all have the same content')
          .addButton(btn =>
            btn
              .setButtonText('Resolve Conflicts')
              .onClick(() => this.plugin.resolveMasterNote())
              .setCta() 
          );
      
        // PULL LATEST
        new Setting(this.contentEl)
          .setName('Get Note Changes')
          .setDesc('Get your friend\'s newest version of the note')
          .addButton(btn =>
            btn.setButtonText('Get Note Changes').onClick(() => this.plugin.pullMasterNote())
            .setCta() 
          );
          new Setting(this.contentEl)
          .setName('Delete Key')
          .addButton(btn =>
            btn
              .setButtonText('Delete Key')
              .setWarning()
              .onClick(async () => {
                const confirm = await new Promise<boolean>(res =>
                  new ConfirmationModal(
                    this.app,
                    `Really delete the key for "${noteName}"?`,
                    res
                  ).open()
                );
                if (!confirm) return;
                this.plugin.settings.keys = this.plugin.settings.keys.filter(
                  k => k.filePath !== filePath
                );
                await this.plugin.saveSettings();
                new Notice(`Key for "${noteName}" deleted.`, 3000);
                this.activeNoteFile = this.app.workspace.getActiveFile();
                this.noteType = await this.determineNoteType(this.activeNoteFile);
                this.renderPanelContent();
              })
          );

      }
      }
