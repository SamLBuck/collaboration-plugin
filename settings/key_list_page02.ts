import { App, Modal, Setting, ButtonComponent, TextComponent, Notice } from 'obsidian';
import MyPlugin, { KeyItem } from '../main';
import { listKeys, deleteKey, generateKey, addKey } from '../storage/keyManager'; // Ensure these are imported

export class KeyListModal extends Modal {
    plugin: MyPlugin;

    private newKeyIdInput: HTMLInputElement;
    private newNoteNameInput: HTMLInputElement;
    private newAccessTypeSelect: HTMLSelectElement;

    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty(); // Clear existing content

        contentEl.createEl('h2', { text: 'All Collaboration Keys' });

        // Create a dedicated container for the key list display
        const keyListDisplayContainer = contentEl.createDiv({ cls: 'key-list-display-container' });
        this.renderKeyList(keyListDisplayContainer); // Pass this container to render the list into it

        // Render the "Manually Add New Key" section below the list
        this.renderAddKeySection(contentEl);

        // Add a close button at the bottom of the modal
        new Setting(contentEl)
            .addButton(button => {
                button.setButtonText("Close")
                    .onClick(() => this.close());
            });
    }

    async renderKeyList(containerToRenderInto: HTMLElement): Promise<void> {
        containerToRenderInto.empty(); // Clear content of the specific list container

        const currentKeys = await listKeys(this.plugin);

        if (currentKeys.length === 0) {
            containerToRenderInto.createEl('p', { text: 'No keys currently stored.' });
        } else {
            currentKeys.forEach((keyItem: KeyItem) => {
                const keyRow = containerToRenderInto.createDiv({ cls: 'key-row' });
                keyRow.style.display = 'flex';
                keyRow.style.justifyContent = 'space-between';
                keyRow.style.alignItems = 'center';
                keyRow.style.padding = '8px 0';
                keyRow.style.borderBottom = '1px solid var(--background-modifier-border)';

                keyRow.createSpan({
                    text: `Key: ${keyItem.id.substring(0, 8)}... | Note: ${keyItem.note} | Access: ${keyItem.access}`,
                    cls: 'key-display-text'
                }).style.flexGrow = '1';

                const deleteButton = new ButtonComponent(keyRow)
                    .setButtonText('Delete')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        if (confirm(`Are you sure you want to delete key for "${keyItem.note}" (${keyItem.access})?`)) {
                            await deleteKey(this.plugin, keyItem.id);
                            new Notice(`Key for "${keyItem.note}" deleted.`, 3000);
                            this.renderKeyList(containerToRenderInto); // Re-render the list after deletion
                        }
                    });
            });
        }
    }

    private renderAddKeySection(containerEl: HTMLElement): void {
        const addKeySection = containerEl.createDiv({ cls: 'add-key-section' });
        addKeySection.createEl("h3", { text: "Manually Add New Key" });

        new Setting(addKeySection)
            .setName("Key / Password")
            .setDesc("Enter the key string directly. Leave empty to auto-generate.")
            .addText(text => {
                this.newKeyIdInput = text.inputEl;
                text.setPlaceholder("e.g., your-custom-password");
            });

        new Setting(addKeySection)
            .setName("Note Name")
            .setDesc("The note associated with this key.")
            .addText(text => {
                this.newNoteNameInput = text.inputEl;
                text.setPlaceholder("e.g., My Shared Document")
                    .setValue(this.app.workspace.getActiveFile()?.basename || '');
            });

        new Setting(addKeySection)
            .setName("Access Type")
            .setDesc("Select the access level.")
            .addDropdown(dropdown => {
                this.newAccessTypeSelect = dropdown.selectEl;
                dropdown.addOption("View", "View");
                dropdown.addOption("Edit", "Edit");
                dropdown.addOption("View and Comment", "View and Comment");
                dropdown.addOption("Edit w/ Approval", "Edit w/ Approval");
                dropdown.setValue("Edit");
            });

        new Setting(addKeySection)
            .addButton(button => {
                button.setButtonText("Add Key")
                    .setCta()
                    .onClick(async () => {
                        const keyId = this.newKeyIdInput.value.trim();
                        const noteName = this.newNoteNameInput.value.trim();
                        const accessType = this.newAccessTypeSelect.value;

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
                                this.newKeyIdInput.value = ''; // Clear key input
                                this.newNoteNameInput.value = this.app.workspace.getActiveFile()?.basename || ''; // Reset note name
                                // Re-render the key list, passing the correct container for the list
                                const keyListDisplayContainer = containerEl.querySelector('.key-list-display-container') as HTMLElement;
                                if (keyListDisplayContainer) {
                                    this.renderKeyList(keyListDisplayContainer);
                                }
                            } else {
                                new Notice("Failed to add key. It might already exist (password collision).", 4000);
                            }
                        }
                    });
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}