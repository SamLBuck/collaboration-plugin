// views/LinkNoteView.ts
import { App, ItemView, WorkspaceLeaf, ButtonComponent, Notice, Setting, TextComponent, Modal, DropdownComponent, TFile } from 'obsidian';
import MyPlugin, { KeyItem } from '../main';
import { requestNoteFromPeer } from '../networking/socket/client';
import { pullNoteFromPeerNewNote, rewriteExistingNote } from '../utils/pull_note_command';
import { parseKey } from '../utils/parse_key';

// Re-use ConfirmationModal as it's identical
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

export const LINK_NOTE_VIEW_TYPE = 'link-note-view';

export class LinkNoteView extends ItemView {
    plugin: MyPlugin;
    linkNoteKeyInput: TextComponent;
    private linkedKeysContainer: HTMLElement; // Container for displaying linked keys

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return LINK_NOTE_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Link/Pull Note';
    }

    getIcon(): string {
        return 'link';
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass('link-note-panel');

        // Back button to main Collaboration Panel
        new Setting(this.contentEl)
            .addButton(button => {
                button.setButtonText('← Back to Control Panel')
                    .onClick(() => {
                        this.plugin.activateView('collaboration-panel-view');
                    });
            });

        // --- Start copying UI and logic from LinkNoteModal ---
        this.contentEl.createEl("h2", { text: "Pull Collaborative Note" });
        this.contentEl.createEl('p', { text: 'Use this section to pull a shared note from a peer using a key.' });

        // Input for the Share Key / Password (consistent with modal)
        new Setting(this.contentEl)
            .setName('Share Key / Password')
            .setDesc('Enter the key/password for the shared note you want to pull (e.g., IP-NoteName).')
            .addText(text => {
                this.linkNoteKeyInput = text;
                text.setPlaceholder('e.g., 192.168.1.100-MySharedNote');
            });

        // Pull Button (consistent with modal)
        new Setting(this.contentEl)
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
                        const filePath = `${keyBasename}.md`; // Assuming all notes are in the root for now

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
                                await rewriteExistingNote(this.app, ip, keyBasename);
                            } else {
                                await pullNoteFromPeerNewNote(this.app, ip, keyBasename);
                            }

                            // Add the successfully used key to linkedKeys if it's not already there
                            const existingLinkedKey = this.plugin.settings.linkedKeys.find(item => item.ip === input);
                            if (!existingLinkedKey) {
                                const newLinkedKeyItem: KeyItem = {
                                    ip: input, note: keyBasename, access: 'Pulled',
                                };
                                this.plugin.settings.linkedKeys.push(newLinkedKeyItem);
                                await this.plugin.saveSettings();
                                new Notice(`Key "${input}" added to your linked keys list.`, 3000);
                            }

                            // Open the created/updated note
                            file = this.app.vault.getAbstractFileByPath(filePath) as TFile; // Re-fetch in case it was newly created
                            if (file) {
                                await this.app.workspace.getLeaf(true).openFile(file); // Open in a new leaf
                                new Notice(`Pulled and opened "${file.basename}" successfully.`, 4000);
                            } else {
                                new Notice(`Pulled "${keyBasename}" successfully, but could not open the file.`, 4000);
                            }

                            // Re-render the linked keys list regardless of note opening success
                            await this.renderLinkedKeysContent(this.linkedKeysContainer);

                        } catch (error: any) {
                            console.error('Error pulling note:', error);
                            new Notice(`An error occurred while pulling the note: ${error.message}`, 5000);
                        }
                    });
            });

        // --- End copying UI and logic from LinkNoteModal ---

        this.contentEl.createEl("h3", { text: "My Linked Keys (from others)" });
        this.linkedKeysContainer = this.contentEl.createDiv({ cls: 'linked-keys-container' });
        await this.renderLinkedKeysContent(this.linkedKeysContainer);
    }

    async onClose(): Promise<void> {
        console.log('Link Note View closed');
    }

    private async renderLinkedKeysContent(containerToRenderInto: HTMLElement): Promise<void> {
        containerToRenderInto.empty();

        const linkedKeys = this.plugin.settings.linkedKeys ?? [];

        if (linkedKeys.length === 0) {
            containerToRenderInto.createEl('p', { text: 'No external keys linked yet. Pull a note using a key from a peer to add it here.', cls: 'empty-list-message' });
        } else {
            const listHeader = containerToRenderInto.createDiv({ cls: 'linked-keys-header' });
            listHeader.style.display = 'grid';
            listHeader.style.gridTemplateColumns = '2fr 1.5fr 1fr 3fr 0.5fr'; // 5 columns

            // CORRECTED: Using .classList.add() instead of .setClass()
            listHeader.createSpan({ text: 'Key (Full)' }).classList.add('list-header-cell');
            listHeader.createSpan({ text: 'Note Name' }).classList.add('list-header-cell');
            listHeader.createSpan({ text: 'Access Type' }).classList.add('list-header-cell');
            listHeader.createSpan({ text: 'Content (Partial)' }).classList.add('list-header-cell');
            listHeader.createSpan({ text: 'Actions' }).classList.add('list-header-cell');

            for (const keyItem of linkedKeys) {
                const keyRow = containerToRenderInto.createDiv({ cls: 'linked-keys-row' });
                keyRow.style.display = 'grid';
                keyRow.style.gridTemplateColumns = '2fr 1.5fr 1fr 3fr 0.5fr'; // 5 columns

                keyRow.createDiv({ text: keyItem.ip, cls: ['key-id-display', 'field-content-box'] });
                keyRow.createDiv({ text: keyItem.note, cls: ['note-name-display', 'field-content-box'] });

                // Access Type display (always 'Pulled' for this view)
                keyRow.createDiv({ text: 'Pulled', cls: ['access-type-display', 'field-content-box'] });

                // Content display for the pulled note
                const contentDiv = keyRow.createDiv({ cls: ['note-content-display', 'field-content-box'] });
                const filePath = `${keyItem.note}.md`; // Assuming note is in root and is .md
                const noteFile = this.app.vault.getAbstractFileByPath(filePath);

                if (noteFile instanceof TFile) {
                    try {
                        const content = await this.app.vault.read(noteFile);
                        const snippet = content.substring(0, 100) + (content.length > 100 ? '...' : '');
                        contentDiv.setText(snippet);
                        contentDiv.setAttr('title', content); // Full content on hover
                    } catch (readError) {
                        console.error(`Error reading note content for "${keyItem.note}":`, readError);
                        contentDiv.setText('Error reading content.');
                        contentDiv.setAttr('title', 'Could not read file content.');
                    }
                } else {
                    contentDiv.setText('File not found.');
                    contentDiv.setAttr('title', `Note file "${filePath}" not found in vault.`);
                }

                const actionsDiv = keyRow.createDiv({ cls: 'linked-key-actions' });

                // Copy button
                new ButtonComponent(actionsDiv)
                    .setIcon('copy')
                    .setTooltip('Copy Key to Clipboard')
                    .onClick(async () => {
                        await navigator.clipboard.writeText(keyItem.ip);
                        new Notice(`Key "${keyItem.ip}" copied to clipboard!`, 2000);
                    });

                // Delete button for linked keys (trash icon)
                new ButtonComponent(actionsDiv)
                    .setIcon('trash')
                    .setTooltip('Remove from Linked Keys (Does NOT delete the note file)')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        const confirmDelete = await new Promise<boolean>(resolve => {
                            new ConfirmationModal(this.app, `Are you sure you want to remove the linked key for "${keyItem.note}"? This will NOT delete the actual note file from your vault.`, resolve).open();
                        });

                        if (confirmDelete) {
                            this.plugin.settings.linkedKeys = this.plugin.settings.linkedKeys.filter(item => item.ip !== keyItem.ip);
                            await this.plugin.saveSettings();
                            new Notice(`Linked key for "${keyItem.note}" removed. The note file remains.`, 3000);
                            await this.renderLinkedKeysContent(containerToRenderInto); // Re-render the list
                        } else {
                            new Notice("Removal cancelled.", 2000);
                        }
                    });
            }
        }
    }
}