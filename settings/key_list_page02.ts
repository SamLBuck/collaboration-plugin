import { App, Modal, Setting, ButtonComponent, Notice, TextComponent, DropdownComponent } from 'obsidian';
import MyPlugin, { KeyItem } from '../main';
import { listKeys, deleteKey, addKey, generateKey } from '../storage/keyManager';

// Define a generic ConfirmationModal for reuse
export class ConfirmationModal extends Modal { // ADDED 'export' keyword here
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


export class KeyListModal extends Modal {
    plugin: MyPlugin;
    private keyListContainer: HTMLElement;

    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'All Collaboration Keys' });

        this.keyListContainer = contentEl.createDiv({ cls: 'key-list-container' });
        await this.renderKeyListContent(this.keyListContainer);

        contentEl.createEl("h3", { text: "Server Shared Notes (Registry)" });
        const registryDisplayContainer = contentEl.createDiv({ cls: 'note-registry-container' });
        this.renderNoteRegistryContent(registryDisplayContainer);
    }

    onClose() {
        this.contentEl.empty();
    }

    private async renderKeyListContent(containerToRenderInto: HTMLElement): Promise<void> {
        containerToRenderInto.empty();

        const currentKeys = await listKeys(this.plugin);

        if (currentKeys.length === 0) {
            containerToRenderInto.createEl('p', { text: 'No keys currently stored.' , cls: 'empty-list-message' });
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

                const actionsDiv = keyRow.createDiv({ cls: 'key-actions' });
                
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
                        // Use the new ConfirmationModal
                        const confirmDelete = await new Promise<boolean>(resolve => {
                            new ConfirmationModal(this.app, `Are you sure you want to delete the key for "${keyItem.note}" (${keyItem.access})?`, resolve).open();
                        });

                        if (confirmDelete) {
                            await deleteKey(this.plugin, keyItem.ip);
                            new Notice(`Key for "${keyItem.note}" deleted.`, 3000);
                            await this.renderKeyListContent(containerToRenderInto);
                        } else {
                            new Notice("Key deletion cancelled.", 2000);
                        }
                    });
            });
        }
    }

    private renderNoteRegistryContent(containerEl: HTMLElement): void {
        containerEl.empty();
        const registry = this.plugin.settings.registry ?? [];

        if (registry.length === 0) {
            containerEl.createEl('p', { text: 'No notes currently shared in the local registry.' , cls: 'empty-list-message'});
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

                const actionsDiv = row.createDiv({ cls: 'registry-actions' });
                new ButtonComponent(actionsDiv)
                    .setIcon('trash')
                    .setTooltip('Delete from Registry')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        // Use the new ConfirmationModal
                        const confirmDelete = await new Promise<boolean>(resolve => {
                            new ConfirmationModal(this.app, `Are you sure you want to delete note "${item.key}" from the registry?`, resolve).open();
                        });

                        if (confirmDelete) {
                            const currentRegistry = this.plugin.settings.registry.filter(regItem => regItem.key !== item.key);
                            this.plugin.settings.registry = currentRegistry;
                            await this.plugin.saveSettings();
                            new Notice(`Note '${item.key}' deleted from registry.`, 3000);
                            this.renderNoteRegistryContent(containerEl);
                        } else {
                            new Notice("Registry deletion cancelled.", 2000);
                        }
                    });
            });
        }
    }
}
