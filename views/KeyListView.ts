import { App, ItemView, WorkspaceLeaf, ButtonComponent, Notice, Setting } from 'obsidian';
import MyPlugin, { KeyItem } from '../main';
import { listKeys, deleteKey } from '../storage/keyManager';
import { getNoteRegistry, deleteNoteFromRegistry } from '../main';
import { ConfirmationModal } from '../settings/key_list_page02'; // Re-using ConfirmationModal

export const KEY_LIST_VIEW_TYPE = 'key-list-view';

export class KeyListView extends ItemView {
    plugin: MyPlugin;
    private keyListContainer: HTMLElement;
    private registryDisplayContainer: HTMLElement;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return KEY_LIST_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Your Keys & Registry';
    }

    getIcon(): string {
        return 'list'; // Icon for a list
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('key-list-panel'); // Add a class for potential styling

        // Back button to main Collaboration Panel
        new Setting(contentEl)
            .addButton(button => {
                button.setButtonText('← Back to Control Panel')
                    .onClick(() => {
                        this.plugin.activateView('collaboration-panel-view'); // Go back to main panel
                    });
            });

        // --- Section: Your Local Keys ---
        contentEl.createEl('h2', { text: 'Your Local Keys' });
        this.keyListContainer = contentEl.createDiv({ cls: 'key-list-container' });
        await this.renderKeyListContent(this.keyListContainer);

        // --- Section: Server Shared Notes (Registry) ---
        contentEl.createEl("h2", { text: "Server Shared Notes (Registry)" });
        this.registryDisplayContainer = contentEl.createDiv({ cls: 'note-registry-container' });
        await this.renderNoteRegistryContent(this.registryDisplayContainer);
    }

    async onClose(): Promise<void> {
        console.log('Key List View closed');
    }

    // Method to re-render the entire display
    async refreshDisplay(): Promise<void> {
        console.log('Refreshing Key List View display...');
        await this.renderKeyListContent(this.keyListContainer);
        await this.renderNoteRegistryContent(this.registryDisplayContainer);
    }

    // Re-used from previous modal/panel
    private async renderKeyListContent(containerToRenderInto: HTMLElement): Promise<void> {
        containerToRenderInto.empty();

        const currentKeys = await listKeys(this.plugin);

        if (currentKeys.length === 0) {
            containerToRenderInto.createEl('p', { text: 'No keys currently stored.', cls: 'empty-list-message' });
        } else {
            const listHeader = containerToRenderInto.createDiv({ cls: 'key-list-header' });
            listHeader.style.gridTemplateColumns = '2.8fr 1.5fr 1fr 0.7fr';
            listHeader.createSpan({ text: 'Key (Full)' });
            listHeader.createSpan({ text: 'Note Name' });
            listHeader.createSpan({ text: 'Access Type' });
            listHeader.createSpan({ text: 'Actions' });

            currentKeys.forEach((keyItem: KeyItem) => {
                const keyRow = containerToRenderInto.createDiv({ cls: 'key-list-row' });
                keyRow.style.gridTemplateColumns = '2.8fr 1.5fr 1fr 0.7fr';

                keyRow.createDiv({ text: keyItem.ip, cls: ['key-id-display', 'field-content-box'] });
                keyRow.createDiv({ text: keyItem.note, cls: ['note-name-display', 'field-content-box'] });
                keyRow.createDiv({ text: keyItem.access, cls: ['access-type-display', 'field-content-box'] });

                const actionsDiv = keyRow.createDiv({ cls: 'key-actions'});

                new ButtonComponent(actionsDiv)
                    .setIcon('copy')
                    .setTooltip('Copy Key to Clipboard')
                    .onClick(async () => {
                        await navigator.clipboard.writeText(keyItem.ip);
                        new Notice(`Key "${keyItem.ip}" copied to clipboard!`, 2000);
                    });

                new ButtonComponent(actionsDiv)
                    .setIcon('trash')
                    .setTooltip('Delete Key')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        const confirmDelete = await new Promise<boolean>((resolve) => {
                            new ConfirmationModal(
                                this.app,
                                `Are you sure you want to delete the key for "${keyItem.note}" (${keyItem.access})?`,
                                resolve
                            ).open();
                        });

                        if (confirmDelete) {
                            await deleteKey(this.plugin, keyItem.ip); // This deletes from keys only
                            new Notice(`Key for "${keyItem.note}" deleted.`, 3000);
                            await this.refreshDisplay(); // Refresh the panel after deletion
                        } else {
                            new Notice("Key deletion cancelled.", 2000);
                        }
                    });
            });
        }
    }

    // Re-used from previous modal/panel
    private async renderNoteRegistryContent(containerEl: HTMLElement): Promise<void> {
        containerEl.empty(); // Always clear existing content before re-rendering

        // Load settings to ensure we're working with the absolute latest state of the registry
        await this.plugin.loadSettings();
        const registry = this.plugin.settings.registry ?? [];

        console.log("[Registry Render] Current registry loaded:", JSON.stringify(registry));

        if (registry.length === 0) {
            containerEl.createEl('p', { text: 'No notes currently shared in the local registry.', cls: 'empty-list-message' });
        } else {
            const registryHeader = containerEl.createDiv({ cls: 'registry-list-header' });
            registryHeader.style.gridTemplateColumns = '1.5fr 3fr 1fr';
            registryHeader.createSpan({ text: 'Note Key' });
            registryHeader.createSpan({ text: 'Content (Partial)' });
            registryHeader.createSpan({ text: 'Actions' });

            registry.forEach(item => {
                const row = containerEl.createDiv({ cls: 'registry-list-row' });
                row.style.gridTemplateColumns = '1.5fr 3fr 1fr';

                row.createDiv({ text: item.key, cls: ['registry-key-display', 'field-content-box'] });
                row.createDiv({ text: item.content, cls: ['registry-content-display', 'field-content-box'] });

                const actionsDiv = row.createDiv({ cls: 'registry-actions'});
                new ButtonComponent(actionsDiv)
                    .setIcon('trash')
                    .setTooltip('Delete from Registry')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        const confirmDelete = await new Promise<boolean>(resolve => {
                            new ConfirmationModal(this.app, `Are you sure you want to delete note "${item.key}" from the registry?`, resolve).open();
                        });

                        if (confirmDelete) {
                            console.log("[Registry Delete] Attempting to delete note:", item.key);
                            console.log("[Registry Delete] Registry BEFORE filter:", JSON.stringify(this.plugin.settings.registry));

                            // Correctly filter and reassign the registry directly
                            this.plugin.settings.registry = this.plugin.settings.registry.filter(
                                regItem => regItem.key !== item.key
                            );

                            console.log("[Registry Delete] Registry AFTER filter:", JSON.stringify(this.plugin.settings.registry));

                            // Save the updated settings to persist the change to data.json
                            await this.plugin.saveSettings();
                            console.log("[Registry Delete] Settings saved.");

                            new Notice(`Note '${item.key}' deleted from registry.`, 3000);

                            await this.refreshDisplay(); // Refresh the panel after deletion
                        } else {
                            new Notice("Registry deletion cancelled.", 2000);
                        }
                    });
            });
        }
    }
}
