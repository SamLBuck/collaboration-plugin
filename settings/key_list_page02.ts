import { App, Modal, Setting, ButtonComponent, Notice, TextComponent, DropdownComponent } from 'obsidian';
import MyPlugin, { KeyItem } from '../main';
import { listKeys, deleteKey, addKey, generateKey } from '../storage/keyManager';

export class KeyListModal extends Modal {
    plugin: MyPlugin;
    private keyListContainer: HTMLElement;
    private addKeySectionContainer: HTMLElement;

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
        contentEl.empty();

        contentEl.createEl('h2', { text: 'All Collaboration Keys' });

        this.keyListContainer = contentEl.createDiv({ cls: 'key-list-container' });
        await this.renderKeyListContent(this.keyListContainer);

        this.addKeySectionContainer = contentEl.createDiv({ cls: 'add-key-section' });
        this.renderAddKeySection(this.addKeySectionContainer);

        // You might want to display the note registry in the modal as well, if applicable
        contentEl.createEl("h3", { text: "Server Shared Notes (Registry)" });
        const registryDisplayContainer = contentEl.createDiv({ cls: 'note-registry-container' });
        this.renderNoteRegistryContent(registryDisplayContainer);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    // Helper function to render the key list content
    private async renderKeyListContent(containerToRenderInto: HTMLElement): Promise<void> {
        containerToRenderInto.empty();

        const currentKeys = await listKeys(this.plugin);

        if (currentKeys.length === 0) {
            containerToRenderInto.createEl('p', { text: 'No keys currently stored.' , cls: 'empty-list-message' });
        } else {
            const listHeader = containerToRenderInto.createDiv({ cls: 'key-list-header' });
            listHeader.style.gridTemplateColumns = '2.8fr 1.5fr 1fr 0.7fr'; // Consistent with CSS
            listHeader.createSpan({ text: 'Key (Full)' }); // Changed header text
            listHeader.createSpan({ text: 'Note Name' });
            listHeader.createSpan({ text: 'Access Type' });
            listHeader.createSpan({ text: 'Actions' });

            currentKeys.forEach((keyItem: KeyItem) => {
                const keyRow = containerToRenderInto.createDiv({ cls: 'key-list-row' });
                keyRow.style.gridTemplateColumns = '2.8fr 1.5fr 1fr 0.7fr'; // Consistent with CSS
                
                // NEW: Wrap content in a div with .field-content-box for styling
                keyRow.createDiv({ text: keyItem.ip, cls: ['key-id-display', 'field-content-box'] });
                keyRow.createDiv({ text: keyItem.note, cls: ['note-name-display', 'field-content-box'] });
                keyRow.createDiv({ text: keyItem.access, cls: ['access-type-display', 'field-content-box'] });

                const actionsDiv = keyRow.createDiv({ cls: 'key-actions' });
                
                // NEW: Copy button
                new ButtonComponent(actionsDiv)
                    .setIcon('copy') // Obsidian's built-in copy icon
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
                        if (confirm(`Are you sure you want to delete the key for "${keyItem.note}" (${keyItem.access})?`)) {
                            await deleteKey(this.plugin, keyItem.ip);
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
        // Corrected: Use containerEl.createEl directly within this function's scope
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
                            newKeyItem = { ip: keyId, note: noteName, access: accessType };
                        } else {
                            newKeyItem = await generateKey(this.plugin, noteName, accessType);
                        }

                        if (newKeyItem) {
                            const success = await addKey(this.plugin, newKeyItem);
                            if (success) {
                                new Notice(`Key added: ${newKeyItem.ip.substring(0, 8)}...`, 3000); // Still show partial in notice
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

                // NEW: Wrap content in a div with .field-content-box for styling
                row.createDiv({ text: item.key, cls: ['registry-key-display', 'field-content-box'] });
                // Remove substring for registry content, let CSS handle truncation
                row.createDiv({ text: item.content, cls: ['registry-content-display', 'field-content-box'] });

                const actionsDiv = row.createDiv({ cls: 'registry-actions' });
                new ButtonComponent(actionsDiv)
                    .setIcon('trash')
                    .setTooltip('Delete from Registry')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        if (confirm(`Are you sure you want to delete note "${item.key}" from the registry?`)) {
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
