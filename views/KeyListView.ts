// views/KeyListView.ts
import { App, ItemView, WorkspaceLeaf, Setting, ButtonComponent, Notice, Modal } from 'obsidian';
import MyPlugin, { deleteNoteFromRegistry, KeyItem } from '../main';
// IMPORTANT: Updated import to use deleteSpecificKey
import { deleteSpecificKey } from '../storage/keyManager'; // Now importing deleteSpecificKey
import { getNoteRegistry } from '../storage/registryStore'; // Import from registryStore
import { KEY_LIST_VIEW_TYPE } from '../constants/viewTypes';

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


export class KeyListView extends ItemView {
    plugin: MyPlugin;
    private keysContainer: HTMLElement; // Container for displaying generated keys
    private registryListContainer: HTMLElement; // Container for displaying local registry

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return KEY_LIST_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'My Shared Keys & Registry';
    }

    getIcon(): string {
        return 'key';
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass('key-list-panel');

        // Back button to main Collaboration Panel
        new Setting(this.contentEl)
            .addButton(button => {
                button.setButtonText('← Back to Control Panel')
                    .onClick(() => {
                        this.plugin.activateView('collaboration-panel-view');
                    });
            });

        // --- Section 1: Your Shared Keys ---
        this.contentEl.createEl("h2", { text: "Your Generated Collaboration Keys" });
        this.contentEl.createEl('p', { text: 'These are the keys you have generated to share your notes with others.' });

        this.keysContainer = this.contentEl.createDiv({ cls: 'generated-keys-container' });
        await this.renderKeysContent(this.keysContainer);

        // --- Section 2: Local Shared Notes Registry ---
        this.contentEl.createEl("h2", { text: "Local Shared Notes Registry" });
        this.contentEl.createEl('p', { text: 'This registry lists notes that are currently configured to be shared by your local server.' });
        
        this.registryListContainer = this.contentEl.createDiv({ cls: 'registry-list-container' });
        await this.renderRegistryContent(this.registryListContainer);
    }

    async onClose(): Promise<void> {
        console.log('Key List View closed');
    }

    private async renderKeysContent(containerToRenderInto: HTMLElement): Promise<void> {
        containerToRenderInto.empty();

        const keys = this.plugin.settings.keys ?? [];

        if (keys.length === 0) {
            containerToRenderInto.createEl('p', { text: 'No keys generated yet. Use the settings tab to generate a new key.', cls: 'empty-list-message' });
        } else {
            const listHeader = containerToRenderInto.createDiv({ cls: 'shared-keys-header' });
            listHeader.style.display = 'grid';
            listHeader.style.gridTemplateColumns = '2fr 1.5fr 1fr 0.5fr';
            listHeader.createSpan({ text: 'Key (Full)' });
            listHeader.createSpan({ text: 'Note Name' });
            listHeader.createSpan({ text: 'Access' });
            listHeader.createSpan({ text: 'Actions' });

            keys.forEach((keyItem: KeyItem) => {
                const keyRow = containerToRenderInto.createDiv({ cls: 'shared-keys-row' });
                keyRow.style.display = 'grid';
                keyRow.style.gridTemplateColumns = '2fr 1.5fr 1fr 0.5fr';

                keyRow.createDiv({ text: keyItem.ip, cls: ['shared-key-id-display', 'field-content-box'] });
                keyRow.createDiv({ text: keyItem.note, cls: ['shared-note-name-display', 'field-content-box'] });
                keyRow.createDiv({ text: keyItem.access, cls: ['shared-access-type-display', 'field-content-box'] });

                const actionsDiv = keyRow.createDiv({ cls: 'shared-key-actions' });

                new ButtonComponent(actionsDiv)
                    .setIcon('copy')
                    .setTooltip('Copy Key to Clipboard')
                    .onClick(async () => {
                        await navigator.clipboard.writeText(keyItem.ip);
                        new Notice(`Key "${keyItem.ip}" copied to clipboard!`, 2000);
                    });

                new ButtonComponent(actionsDiv)
                    .setIcon('trash')
                    // UPDATED TOOLTIP AND CONFIRMATION MESSAGE
                    .setTooltip('Stop Sharing this Note (Removes Key, Keeps Registry Content)')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        const confirmDelete = await new Promise<boolean>(resolve => {
                            new ConfirmationModal(this.app, `Are you sure you want to stop sharing "${keyItem.note}" (Access: ${keyItem.access})? This will remove the key but leave the note content in your registry.`, resolve).open();
                        });

                        if (confirmDelete) {
                            // UPDATED: Calling deleteSpecificKey instead of deleteKeyAndContent
                            const deleted = await deleteSpecificKey(this.plugin, keyItem.ip); // Pass the full key string
                            if (deleted) {
                                // UPDATED: Notice message
                                new Notice(`Stopped sharing "${keyItem.note}". Key removed.`, 3000);
                                await this.renderKeysContent(containerToRenderInto); // Re-render only the keys list
                                // REMOVED: No need to re-render registry as its content is not affected by this action
                                // await this.renderRegistryContent(this.registryListContainer);
                            } else {
                                // UPDATED: Notice message
                                new Notice(`Failed to remove key for "${keyItem.note}". It might not exist.`, 4000);
                            }
                        } else {
                            new Notice("Action cancelled.", 2000);
                        }
                    });
            });
        }
    }

    private async renderRegistryContent(containerToRenderInto: HTMLElement): Promise<void> {
        containerToRenderInto.empty();

        const registry = getNoteRegistry(this.plugin); // Get data from registryStore

        if (registry.length === 0) {
            containerToRenderInto.createEl('p', { text: 'No notes are currently registered for sharing by your local server.', cls: 'empty-list-message' });
        } else {
            const listHeader = containerToRenderInto.createDiv({ cls: 'registry-list-header' });
            listHeader.style.display = 'grid';
            // UPDATED: Removed column for 'Access Status'
            listHeader.style.gridTemplateColumns = '1.5fr 3fr 0.5fr'; // Adjusted column widths
            listHeader.createSpan({ text: 'Note Name (Registered Key)' });
            listHeader.createSpan({ text: 'Content (Partial)' }); // Content header
            listHeader.createSpan({ text: 'Actions' });

            registry.forEach(item => { // Iterate over NoteRegistryItem
                const row = containerToRenderInto.createDiv({ cls: 'registry-list-row' });
                row.style.display = 'grid';
                // UPDATED: Removed column for 'Access Status'
                row.style.gridTemplateColumns = '1.5fr 3fr 0.5fr'; // Match header columns

                row.createDiv({ text: item.key, cls: ['registry-note-name', 'field-content-box'] });
                // Display note content, now with a title attribute for full text on hover
                row.createDiv({ 
                    text: item.content.substring(0, 50) + (item.content.length > 50 ? '...' : ''), // Display first 50 chars + ellipsis
                    cls: ['registry-content-display', 'field-content-box'],
                    title: item.content // Add title attribute for full content on hover
                });
                
                const actionsDiv = row.createDiv({ cls: 'registry-actions' });

                new ButtonComponent(actionsDiv)
                    .setIcon('trash')
                    .setTooltip('Remove from Registry (Stop Sharing this Content)')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        const confirmStop = await new Promise<boolean>(resolve => {
                            new ConfirmationModal(this.app, `Are you sure you want to remove "${item.key}" from the local registry? This will stop sharing its content.`, resolve).open();
                        });

                        if (confirmStop) {
                            // This button still explicitly removes from registry
                            await deleteNoteFromRegistry(this.plugin, item.key); // Use deleteNoteFromRegistry
                            new Notice(`Removed "${item.key}" from registry.`, 3000);
                            await this.renderRegistryContent(containerToRenderInto); // Re-render registry
                        } else {
                            new Notice("Action cancelled.", 2000);
                        }
                    });
            });
        }
    }
}

export { KEY_LIST_VIEW_TYPE };
