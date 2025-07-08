import { App, Modal, Setting, TextComponent, ButtonComponent, Notice, TFile } from "obsidian";
import MyPlugin, { KeyItem } from "../main";
import { requestNoteFromPeer } from "../networking/socket/client";
import { pullNoteFromPeerNewNote, rewriteExistingNote } from "../utils/pull_note_command";
import { parseKey } from "../utils/parse_key"; // Assuming parseKey is updated to handle full key string

// Define a generic ConfirmationModal for reuse
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
                button.setButtonText('Confirm')
                    .setCta()
                    .setClass('mod-warning') // Use a warning style for destructive actions
                    .onClick(() => {
                        this.callback(true);
                        this.close();
                    });
            })
            .addButton(button => {
                button.setButtonText('Cancel')
                    .onClick(() => {
                        this.callback(false);
                        this.close();
                    });
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}


export class LinkNoteModal extends Modal {
    plugin: MyPlugin;
    linkNoteKeyInput: TextComponent;
    private linkedKeysContainer: HTMLElement; // Container for displaying linked keys

    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Make the modal bigger for more space
        this.modalEl.style.width = '80%'; // Adjust as needed, e.g., '600px' or '80%'
        this.modalEl.style.height = '70%'; // Adjust as needed, e.g., '500px' or '70%'
        this.modalEl.style.maxWidth = '800px'; // Optional: Set a max-width
        this.modalEl.style.maxHeight = '600px'; // Optional: Set a max-height


        contentEl.createEl("h2", { text: "Pull Collaborative Note" });
        contentEl.createEl('p', { text: 'Use this section to pull a shared note from a peer using a key.' });

        new Setting(contentEl)
            .setName('Share Key / Password')
            .setDesc('Enter the key/password for the shared note you want to .')
            .addText(text => {
                this.linkNoteKeyInput = text;
                text.setPlaceholder('e.g., 192.168.1.100-MySharedNote');
            });

        new Setting(contentEl)
            .addButton(button => {
                button.setButtonText('Pull Note')
                    .setCta()
                    .onClick(async () => {
                        const input = this.linkNoteKeyInput.getValue().trim();
                        if (!input) {
                            new Notice('Please enter a Share Key / Password to pull a note.', 3000);
                            return;
                        }

                        let parsedKeyInfo;
                        try {
                            parsedKeyInfo = parseKey(input);
                            if (!parsedKeyInfo || !parsedKeyInfo.ip || !parsedKeyInfo.noteName) {
                                throw new Error('Invalid key format. Expected "IP-NoteName".');
                            }
                        } catch (error: any) {
                            new Notice(`Key parsing error: ${error.message}`, 5000);
                            return;
                        }

                        const { ip, noteName: keyBasename } = parsedKeyInfo;
                        const filePath = `${keyBasename}.md`; // Use parsed noteName for file path
                        
                        let file: TFile | null = this.app.vault.getAbstractFileByPath(filePath) as TFile;
                        let overwrite = false;

                        if (file) {
                            overwrite = await new Promise(resolve => {
                                new ConfirmationModal(this.app, `Note "${filePath}" already exists. Overwrite it with the pulled content?`, resolve).open();
                            });

                            if (!overwrite) {
                                new Notice(`Pull cancelled for "${filePath}". Note not overwritten.`, 3000);
                                return;
                            }
                        }

                        try {
                            if (file && overwrite) {
                                await rewriteExistingNote(this.app, ip, keyBasename, this.plugin);
                            } else {
                                await pullNoteFromPeerNewNote(this.app, ip, keyBasename);
                            }

                            // Add the successfully used key to linkedKeys if it's not already there
                            const existingLinkedKey = this.plugin.settings.linkedKeys.find(item => item.ip === input);
                            if (!existingLinkedKey) {
                                // Default access type for linked keys could be 'Pulled' or 'View'
                                const newLinkedKeyItem: KeyItem = {
                                    ip: input, note: keyBasename, access: 'Pulled',
                                    //content: undefined
                                };
                                this.plugin.settings.linkedKeys.push(newLinkedKeyItem);
                                await this.plugin.saveSettings();
                                new Notice(`Key "${input}" added to your linked keys list.`, 3000);
                            }

                            // Open the created/updated note
                            file = this.app.vault.getAbstractFileByPath(filePath) as TFile; // Re-fetch in case it was newly created
                            if (file) {
                                this.app.workspace.openLinkText(file.path, '', false);
                            }
							this.close();

							file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
							if (file) {
							// Switch to the pulled note
									await this.app.workspace.getLeaf(true).openFile(file);
									new Notice(`Pulled and opened "${file.basename}" successfully.`, 4000);
							} else {

                            
                            // Re-render the linked keys list
                            await this.renderLinkedKeysContent(this.linkedKeysContainer);
							}
                        } catch (error: any) {
                            console.error('Error pulling note:', error);
                            new Notice(`An error occurred while pulling the note: ${error.message}`, 5000);
                        }
                    });
            });
        
        contentEl.createEl("h3", { text: "My Linked Key" });
        this.linkedKeysContainer = contentEl.createDiv({ cls: 'linked-keys-container' });
        await this.renderLinkedKeysContent(this.linkedKeysContainer);
    }

    onClose() {
        this.contentEl.empty();
    }

    private async renderLinkedKeysContent(container: HTMLElement): Promise<void> {
        container.empty();
    
        /* ── keep only items that match the view-only shape ────────────── */
        const raw = this.plugin.settings.linkedKeys ?? [];
        const viewOnlyKeys = raw.filter(k => typeof k.ip === 'string' && typeof k.note === 'string');
    
        /* ── (optional) CLEAN the array so junk rows never return ──────── */
        if (viewOnlyKeys.length !== raw.length) {            // ← delete this block
            this.plugin.settings.linkedKeys = viewOnlyKeys;  //   if you prefer
            await this.plugin.saveSettings();                //   to *hide* only.
        }                                                    // ───────── CLEAN
    
        if (viewOnlyKeys.length === 0) {
            container.createEl('p', {
                text: 'No external keys linked yet. Pull a note using a key from a peer to add it here.',
                cls: 'empty-list-message'
            });
            return;
        }
    
        /* ── header row ───────────────────────────────────────────────── */
        const header = container.createDiv({ cls: 'linked-keys-header' });
        header.style.display = 'grid';
        header.style.gridTemplateColumns = '2fr 1.5fr 0.5fr';
        header.createSpan({ text: 'Key (Full)' });
        header.createSpan({ text: 'Note Name' });
        header.createSpan({ text: 'Actions' });
    
        /* ── data rows ───────────────────────────────────────────────── */
        viewOnlyKeys.forEach(keyItem => {
            const row = container.createDiv({ cls: 'linked-keys-row' });
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '2fr 1.5fr 0.5fr';
    
            /* full key + note name */
            row.createDiv({ text: keyItem.ip,   cls: ['linked-key-id-display',  'field-content-box'] });
            row.createDiv({ text: keyItem.note, cls: ['linked-note-name-display','field-content-box'] });
    
            /* actions */
            const actions = row.createDiv({ cls: 'linked-key-actions' });
    
            new ButtonComponent(actions)
                .setIcon('copy')
                .setTooltip('Copy Key to Clipboard')
                .onClick(async () => {
                    await navigator.clipboard.writeText(keyItem.ip);
                    new Notice(`Key "${keyItem.ip}" copied to clipboard!`, 2_000);
                });
    
            new ButtonComponent(actions)
                .setIcon('trash')
                .setTooltip('Remove from Linked Keys')
                .setClass('mod-warning')
                .onClick(async () => {
                    const ok = await new Promise<boolean>(res =>
                        new ConfirmationModal(
                            this.app,
                            `Remove the linked key for "${keyItem.note}"? This does not delete the note itself.`,
                            res
                        ).open()
                    );
                    if (!ok) return;
    
                    this.plugin.settings.linkedKeys =
                        this.plugin.settings.linkedKeys.filter(k => k !== keyItem);
                    await this.plugin.saveSettings();
                    new Notice(`Linked key for "${keyItem.note}" removed.`, 3_000);
                    await this.renderLinkedKeysContent(container);  // refresh list
                });
        });
    }
    }