import { App, Modal, Setting, ButtonComponent, Notice, DropdownComponent, TextComponent } from 'obsidian';
import MyPlugin, { KeyItem } from '../main'; // Ensure KeyItem is imported
import { listKeys, deleteKey, addKey, generateKey } from '../storage/keyManager'; // Ensure these are imported

export class KeyListModal extends Modal {
    plugin: MyPlugin;
    private keyListContainer: HTMLElement; // To hold the list of keys
    private addKeySectionContainer: HTMLElement; // To hold the add key section

    // Input references for the "Add New Key" section
    private newKeyIdInput: TextComponent;
    private newNoteNameInput: TextComponent;
    private newAccessTypeSelect: DropdownComponent;


    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty(); // Clear existing content

        contentEl.createEl('h2', { text: 'All Collaboration Keys' });

        this.keyListContainer = contentEl.createDiv({ cls: 'key-list-container' });
        await this.renderKeyListContent(this.keyListContainer); // Initial render of the key list

        this.addKeySectionContainer = contentEl.createDiv({ cls: 'add-key-section' });
        this.renderAddKeySection(this.addKeySectionContainer); // Render the add key section

        // You might want to display the note registry in the modal as well, if applicable
        contentEl.createEl("h3", { text: "Server Shared Notes (Registry)" });
        const registryDisplayContainer = contentEl.createDiv({ cls: 'note-registry-container' });
        this.renderNoteRegistryContent(registryDisplayContainer); // Add this if you want it in the modal
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    // Helper function to render the key list content
    private async renderKeyListContent(containerToRenderInto: HTMLElement): Promise<void> {
        containerToRenderInto.empty(); // Clear content of the specific list container

        const currentKeys = await listKeys(this.plugin);

        if (currentKeys.length === 0) {
            containerToRenderInto.createEl('p', { text: 'No keys currently stored.' , cls: 'empty-list-message' });
        } else {
            const listHeader = containerToRenderInto.createDiv({ cls: 'key-list-header' });
            listHeader.style.gridTemplateColumns = '1fr 2fr 1.5fr 0.5fr'; // Adjust column widths (consistent with CSS)
            listHeader.createSpan({ text: 'Key (Partial)' });
            listHeader.createSpan({ text: 'Note Name' });
            listHeader.createSpan({ text: 'Access Type' });
            listHeader.createSpan({ text: 'Actions' });

            currentKeys.forEach((keyItem: KeyItem) => {
                const keyRow = containerToRenderInto.createDiv({ cls: 'key-list-row' });
                keyRow.style.gridTemplateColumns = '1fr 2fr 1.5fr 0.5fr';
                
                keyRow.createSpan({ text: keyItem.id.substring(0, 8) + '...', cls: 'key-id-display' });
                keyRow.createSpan({ text: keyItem.note, cls: 'note-name-display' });
                keyRow.createSpan({ text: keyItem.access, cls: 'access-type-display' });

                const actionsDiv = keyRow.createDiv({ cls: 'key-actions' });
                new ButtonComponent(actionsDiv)
                    .setIcon('trash')
                    .setTooltip('Delete Key')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        if (confirm(`Are you sure you want to delete the key for "${keyItem.note}" (${keyItem.access})?`)) {
                            await deleteKey(this.plugin, keyItem.id);
                            new Notice(`Key for "${keyItem.note}" deleted.`, 3000);
                            await this.renderKeyListContent(containerToRenderInto); // Re-render the list
                        }
                    });
            });
        }
    }

    // Helper function to render the "Add New Key" section
    private renderAddKeySection(containerEl: HTMLElement): void {
        containerEl.empty();
        containerEl.createEl("h3", { text: "Manually Add New Key" });

        new Setting(containerEl)
            .setName("Key / Password")
            .setDesc("Enter the key string directly. Leave empty to auto-generate.")
            .addText(text => {
                this.newKeyIdInput = text;
                text.setPlaceholder("e.g., your-custom-password");
            });

        new Setting(containerEl)
            .setName("Note Name")
            .setDesc("The note associated with this key.")
            .addText(text => {
                this.newNoteNameInput = text;
                text.setPlaceholder("e.g., My Shared Document")
                    .setValue(this.app.workspace.getActiveFile()?.basename || '');
            });

        new Setting(containerEl)
            .setName("Access Type")
            .setDesc("Select the access level.")
            .addDropdown(dropdown => {
                this.newAccessTypeSelect = dropdown;
                dropdown.addOption("View", "View");
                dropdown.addOption("Edit", "Edit");
                dropdown.addOption("View and Comment", "View and Comment");
                dropdown.addOption("Edit w/ Approval", "Edit w/ Approval");
                dropdown.setValue("Edit");
            });

        new Setting(containerEl)
            .addButton(button => {
                button.setButtonText("Add Key")
                    .setCta()
                    .onClick(async () => {
                        const keyId = this.newKeyIdInput.getValue().trim();
                        const noteName = this.newNoteNameInput.getValue().trim();
                        const accessType = this.newAccessTypeSelect.getValue();

                        if (!noteName) {
                            new Notice("Please provide a Note Name for the new key.", 3000);
                            return;
                        }
                        if (!accessType) {
                            new Notice("Please select an Access Type.", 3000);
                            return;
                        }

                        let newKeyItem: KeyItem | null = null;
                        if (keyId) {
                            newKeyItem = { id: keyId, note: noteName, access: accessType };
                        } else {
                            newKeyItem = await generateKey(this.plugin, noteName, accessType);
                        }

                        if (newKeyItem) {
                            const success = await addKey(this.plugin, newKeyItem);
                            if (success) {
                                new Notice(`Key added: ${newKeyItem.id.substring(0, 8)}...`, 3000);
                                this.newKeyIdInput.setValue(''); // Clear key input
                                this.newNoteNameInput.setValue(this.app.workspace.getActiveFile()?.basename || ''); // Reset note name
                                await this.renderKeyListContent(this.keyListContainer); // Re-render the key list in the modal
                            } else {
                                new Notice("Failed to add key. It might already exist (password collision).", 4000);
                            }
                        }
                    });
            });
    }

    // Helper function to render the note registry content (if you want it in the modal)
    private renderNoteRegistryContent(containerEl: HTMLElement): void {
        containerEl.empty();
        const registry = this.plugin.settings.registry ?? []; // Access the plugin's registry directly

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

                row.createSpan({ text: item.key, cls: 'registry-key-display' });
                row.createSpan({ text: item.content.substring(0, 50) + (item.content.length > 50 ? '...' : ''), cls: 'registry-content-display' });

                const actionsDiv = row.createDiv({ cls: 'registry-actions' });
                new ButtonComponent(actionsDiv)
                    .setIcon('trash')
                    .setTooltip('Delete from Registry')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        if (confirm(`Are you sure you want to delete note "${item.key}" from the registry?`)) {
                            // Assuming deleteNoteFromRegistry is defined and imported in main.ts and accessible via plugin.settings
                            // For this to work, you need to import deleteNoteFromRegistry at the top of this file and call it directly
                            // OR, if deleteNoteFromRegistry is an exported function from main.ts, you can pass this.plugin
                            // Example: await deleteNoteFromRegistry(this.plugin, item.key);
                            new Notice(`Deletion of '${item.key}' from registry not yet fully implemented in modal.`, 3000);
                            // Placeholder:
                             const currentRegistry = this.plugin.settings.registry.filter(regItem => regItem.key !== item.key);
                             this.plugin.settings.registry = currentRegistry;
                             await this.plugin.saveSettings();
                            this.renderNoteRegistryContent(containerEl); // Re-render the registry list
                        }
                    });
            });
        }
    }
}