import { App, ItemView, WorkspaceLeaf, Setting, TextComponent, ButtonComponent, Notice, TFile } from 'obsidian';
import MyPlugin, { KeyItem } from '../main';
import { pullNoteFromPeerNewNote, rewriteExistingNote } from '../utils/pull_note_command';
import { parseKey } from '../utils/parse_key';
import { ConfirmationModal } from '../settings/key_list_page02'; // Re-using ConfirmationModal

export const LINK_NOTE_VIEW_TYPE = 'link-note-view';

export class LinkNoteView extends ItemView {
    plugin: MyPlugin;
    linkNoteKeyInput: TextComponent;
    private linkedKeysContainer: HTMLElement;

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
        return 'link'; // Icon for linking
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('link-note-panel'); // Add a class for potential styling

        // Back button to main Collaboration Panel
        new Setting(contentEl)
            .addButton(button => {
                button.setButtonText('← Back to Control Panel')
                    .onClick(() => {
                        this.plugin.activateView('collaboration-panel-view'); // Go back to main panel
                    });
            });

        // --- Section: Pull Collaborative Note ---
        contentEl.createEl("h2", { text: "Pull Collaborative Note" });
        contentEl.createEl('p', { text: 'Use this section to pull a shared note from a peer using a key.' });

        new Setting(contentEl)
            .setName('Share Key / Password')
            .setDesc('Enter the key/password for the shared note you want to pull (e.g., IP-NoteName).')
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
                        const filePath = `${keyBasename}.md`;
                        
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
                                const newLinkedKeyItem: KeyItem = { ip: input, note: keyBasename, access: 'Pulled' }; // Use 'Pulled' access type for linked keys
                                this.plugin.settings.linkedKeys.push(newLinkedKeyItem);
                                await this.plugin.saveSettings();
                                new Notice(`Key "${input}" added to your linked keys list.`, 3000);
                            }

                            // Open the created/updated note
                            file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
                            if (file) {
                                this.app.workspace.openLinkText(file.path, '', false);
                            }
                            
                            // Re-render the linked keys list
                            await this.renderLinkedKeysContent(this.linkedKeysContainer);

                        } catch (error: any) {
                            console.error('Error pulling note:', error);
                            new Notice(`An error occurred while pulling the note: ${error.message}`, 5000);
                        }
                    });
            });

        // --- Section for displaying Linked Keys ---
        contentEl.createEl("h2", { text: "My Linked Keys (from others)" });
        this.linkedKeysContainer = contentEl.createDiv({ cls: 'linked-keys-container' });
        await this.renderLinkedKeysContent(this.linkedKeysContainer);
    }

    async onClose(): Promise<void> {
        console.log('Link Note View closed');
    }

    // Method to re-render the linked keys display
    async refreshDisplay(): Promise<void> {
        console.log('Refreshing Link Note View display...');
        await this.renderLinkedKeysContent(this.linkedKeysContainer);
    }

    private async renderLinkedKeysContent(containerToRenderInto: HTMLElement): Promise<void> {
        containerToRenderInto.empty();

        const linkedKeys = this.plugin.settings.linkedKeys ?? [];

        if (linkedKeys.length === 0) {
            containerToRenderInto.createEl('p', { text: 'No external keys linked yet. Pull a note using a key from a peer to add it here.' , cls: 'empty-list-message' });
        } else {
            const listHeader = containerToRenderInto.createDiv({ cls: 'linked-keys-header' });
            listHeader.style.display = 'grid';
            listHeader.style.gridTemplateColumns = '2fr 1.5fr 0.5fr';
            listHeader.createSpan({ text: 'Key (Full)' });
            listHeader.createSpan({ text: 'Note Name' });
            listHeader.createSpan({ text: 'Actions' });

            linkedKeys.forEach((keyItem: KeyItem) => {
                const keyRow = containerToRenderInto.createDiv({ cls: 'linked-keys-row' });
                keyRow.style.display = 'grid';
                keyRow.style.gridTemplateColumns = '2fr 1.5fr 0.5fr';

                keyRow.createDiv({ text: keyItem.ip, cls: ['linked-key-id-display', 'field-content-box'] });
                keyRow.createDiv({ text: keyItem.note, cls: ['linked-note-name-display', 'field-content-box'] });

                const actionsDiv = keyRow.createDiv({ cls: 'linked-key-actions' });

                // Copy button
                new ButtonComponent(actionsDiv)
                    .setIcon('copy')
                    .setTooltip('Copy Key to Clipboard')
                    .onClick(async () => {
                        await navigator.clipboard.writeText(keyItem.ip);
                        new Notice(`Key "${keyItem.ip}" copied to clipboard!`, 2000);
                    });

                // Delete button for linked keys
                new ButtonComponent(actionsDiv)
                    .setIcon('trash')
                    .setTooltip('Remove from Linked Keys')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        const confirmDelete = await new Promise<boolean>(resolve => {
                            new ConfirmationModal(this.app, `Are you sure you want to remove the linked key for "${keyItem.note}"? This will not delete the note itself.`, resolve).open();
                        });

                        if (confirmDelete) {
                            this.plugin.settings.linkedKeys = this.plugin.settings.linkedKeys.filter(item => item.ip !== keyItem.ip);
                            await this.plugin.saveSettings();
                            new Notice(`Linked key for "${keyItem.note}" removed.`, 3000);
                            await this.refreshDisplay(); // Re-render the list
                        } else {
                            new Notice("Removal cancelled.", 2000);
                        }
                    });
            });
        }
    }
}
