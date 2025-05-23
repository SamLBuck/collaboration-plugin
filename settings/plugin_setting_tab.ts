import { App, PluginSettingTab, Setting, ButtonComponent, TextComponent, Notice, DropdownComponent, TFile } from 'obsidian';
import MyPlugin, { KeyItem, getNoteRegistry, updateNoteRegistry, deleteNoteFromRegistry } from '../main';
import { generateKey, addKey, listKeys, deleteKey } from '../storage/keyManager';
import { requestNoteFromPeer } from '../networking/socket/client';

type SettingsPage = 'main' | 'keyList' | 'linkNote';

export class PluginSettingsTab extends PluginSettingTab {
    static PLUGIN_ID = 'obsidian-collaboration-plugin-id'; // Ensure this matches your manifest.json ID

    plugin: MyPlugin;
    currentPage: SettingsPage = 'main'; // State to manage the current page in the settings tab

    // Input references for the main settings page
    keyInput: TextComponent;
    noteInput: TextComponent;
    accessTypeView: HTMLInputElement;
    accessTypeEdit: HTMLInputElement;
    accessTypeViewAndComment: HTMLInputElement;
    accessTypeEditWithApproval: HTMLInputElement;

    // Input references for the "Add New Key" section (now inside KeyList page)
    private newKeyIdInput: TextComponent;
    private newNoteNameInput: TextComponent;
    private newAccessTypeSelect: DropdownComponent;


    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty(); // Clear existing content

        switch (this.currentPage) {
            case 'main':
                this.renderMainSettingsPage(containerEl);
                break;
            case 'keyList':
                this.renderKeyListPage(containerEl);
                break;
            case 'linkNote':
                this.renderLinkNotePage(containerEl);
                break;
            default:
                this.renderMainSettingsPage(containerEl); // Fallback
        }
    }

    private renderMainSettingsPage(containerEl: HTMLElement): void {
        containerEl.createEl('h2', { text: 'Collaboration Settings' });

        const keySetting = new Setting(containerEl)
            .setName('Key')
            .setDesc('This will be the unique password for your shared note.');

        const keyControlDiv = keySetting.controlEl.createDiv({ cls: 'key-input-generate-wrapper' });
        keyControlDiv.style.display = 'flex';
        keyControlDiv.style.alignItems = 'center';
        keyControlDiv.style.gap = '8px';

        this.keyInput = new TextComponent(keyControlDiv)
            .setPlaceholder('Leave blank to auto-generate')
            .setValue('');
        this.keyInput.inputEl.style.flexGrow = '1';

        new ButtonComponent(keyControlDiv)
            .setButtonText('Generate')
            .setCta()
            .onClick(async () => {
                const noteName = this.noteInput.getValue().trim();
                const accessType = this.getSelectedAccessType();

                if (!noteName) {
                    new Notice('Please provide a Note Name to generate a key.', 4000);
                    return;
                }
                if (!accessType) {
                    new Notice('Please select an Access Type to generate a key.', 4000);
                    return;
                }

                const existingKey = this.plugin.settings.keys.find(
                    key => key.note === noteName && key.access === accessType
                );
                if (existingKey) {
                    new Notice(`A key for "${noteName}" with "${accessType}" access already exists. Cannot generate a duplicate.`, 6000);
                    return;
                }

                try {
                    const newKeyItem = await generateKey(this.plugin, noteName, accessType);
                    const success = await addKey(this.plugin, newKeyItem);

                    if (success) {
                        this.keyInput.setValue(newKeyItem.id);
                        new Notice(`Generated & Saved:\n${newKeyItem.id}\nFor Note: "${newKeyItem.note}"`, 8000);
                    } else {
                        new Notice("Failed to add key. It might already exist (password collision).", 4000);
                    }
                } catch (error) {
                    console.error("Error generating or adding key:", error);
                    new Notice(`Error: Could not generate key. ${error.message}`, 5000);
                }
            });

        new Setting(containerEl)
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

        const accessTypeSetting = new Setting(containerEl)
            .setName('Access Type')
            .setDesc('Select the type of access this key grants for the note.');

        const checkboxContainer = accessTypeSetting.controlEl.createDiv({ cls: 'access-type-checkboxes' });
        checkboxContainer.style.display = 'flex';
        checkboxContainer.style.flexDirection = 'column';
        checkboxContainer.style.gap = '8px';

        const createCheckbox = (name: string, checked: boolean = false): HTMLInputElement => {
            const wrapper = checkboxContainer.createDiv({ cls: 'checkbox-wrapper' });
            const checkbox = wrapper.createEl('input', { type: 'checkbox', cls: 'access-type-checkbox' });
            const label = wrapper.createEl('label', { text: name, cls: 'access-type-label' });
            label.prepend(checkbox);
            checkbox.checked = checked;

            checkbox.onchange = (evt) => {
                const targetCheckbox = evt.target as HTMLInputElement;
                if (targetCheckbox.checked) {
                    [this.accessTypeView, this.accessTypeEdit, this.accessTypeViewAndComment, this.accessTypeEditWithApproval].forEach(cb => {
                        if (cb && cb !== targetCheckbox) {
                            cb.checked = false;
                        }
                    });
                    new Notice(`Access type selected: ${name}`);
                } else {
                    const anyChecked = [this.accessTypeView, this.accessTypeEdit, this.accessTypeViewAndComment, this.accessTypeEditWithApproval].some(cb => cb?.checked);
                    if (!anyChecked) {
                        targetCheckbox.checked = true;
                        new Notice("At least one access type must be selected.", 3000);
                    }
                }
            };
            return checkbox;
        };

        this.accessTypeView = createCheckbox('View', false);
        this.accessTypeEdit = createCheckbox('Edit', true);
        this.accessTypeViewAndComment = createCheckbox('View and Comment', false);
        this.accessTypeEditWithApproval = createCheckbox('Edit w/ Approval', false);

        const navButtonContainer = containerEl.createDiv({ cls: 'settings-nav-buttons' });
        navButtonContainer.style.display = 'flex';
        navButtonContainer.style.justifyContent = 'space-between';
        navButtonContainer.style.marginTop = '20px';

        const leftButtons = navButtonContainer.createDiv();
        new Setting(leftButtons)
            .addButton(button => {
                button.setButtonText('List of keys')
                    .onClick(() => {
                        this.currentPage = 'keyList'; // Navigate to key list page
                        this.display(); // Re-render the settings tab
                    });
            });

        const rightButtons = navButtonContainer.createDiv();
        new Setting(rightButtons)
            .addButton(button => {
                button.setButtonText('Link Note')
                    .onClick(() => {
                        this.currentPage = 'linkNote'; // Navigate to link note page
                        this.display(); // Re-render the settings tab
                    });
            });

        navButtonContainer.appendChild(leftButtons);
        navButtonContainer.appendChild(rightButtons);

        containerEl.querySelectorAll('.setting-item').forEach(item => {
            (item as HTMLElement).style.marginBottom = '15px';
        });
    }

    private getSelectedAccessType(): string | null {
        if (this.accessTypeView.checked) return 'View';
        if (this.accessTypeEdit.checked) return 'Edit';
        if (this.accessTypeViewAndComment.checked) return 'View and Comment';
        if (this.accessTypeEditWithApproval.checked) return 'Edit w/ Approval';
        return null;
    }

    // --- New Page Rendering Methods ---

    private async renderKeyListPage(containerEl: HTMLElement): Promise<void> {
        containerEl.createEl('h2', { text: 'All Collaboration Keys' });

        // Back button
        new Setting(containerEl)
            .addButton(button => {
                button.setButtonText('← Back to Main Settings')
                    .onClick(() => {
                        this.currentPage = 'main';
                        this.display();
                    });
            });

        const keyListDisplayContainer = containerEl.createDiv({ cls: 'key-list-container' });
        await this.renderKeyListContent(keyListDisplayContainer);

        // Render the "Manually Add New Key" section below the list
        this.renderAddKeySection(containerEl, keyListDisplayContainer);

        // Display the note registry for server-shared notes
        containerEl.createEl("h3", { text: "Server Shared Notes (Registry)" });
        const registryDisplayContainer = containerEl.createDiv({ cls: 'note-registry-container' });
        this.renderNoteRegistryContent(registryDisplayContainer);
    }

    // Helper function to render the key list (used by both modal and settings tab if refactored)
    private async renderKeyListContent(containerToRenderInto: HTMLElement): Promise<void> {
        containerToRenderInto.empty();

        const currentKeys = await listKeys(this.plugin);

        if (currentKeys.length === 0) {
            containerToRenderInto.createEl('p', { text: 'No keys currently stored.', cls: 'empty-list-message' });
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
                keyRow.createDiv({ text: keyItem.id, cls: ['key-id-display', 'field-content-box'] });
                keyRow.createDiv({ text: keyItem.note, cls: ['note-name-display', 'field-content-box'] });
                keyRow.createDiv({ text: keyItem.access, cls: ['access-type-display', 'field-content-box'] });

                const actionsDiv = keyRow.createDiv({ cls: 'key-actions' });
                
                // NEW: Copy button
                new ButtonComponent(actionsDiv)
                    .setIcon('copy') // Obsidian's built-in copy icon
                    .setTooltip('Copy Key to Clipboard')
                    .onClick(async () => {
                        await navigator.clipboard.writeText(keyItem.id);
                        new Notice(`Key "${keyItem.id}" copied to clipboard!`, 2000);
                    });

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

    private renderAddKeySection(containerEl: HTMLElement, keyListDisplayContainer: HTMLElement): void {
        const addKeySection = containerEl.createDiv({ cls: 'add-key-section' });
        addKeySection.createEl("h3", { text: "Manually Add New Key" });

        new Setting(addKeySection)
            .setName("Key / Password")
            .setDesc("Enter the key string directly. Leave empty to auto-generate.")
            .addText(text => {
                this.newKeyIdInput = text;
                text.setPlaceholder("e.g., your-custom-password");
            });

        new Setting(addKeySection)
            .setName("Note Name")
            .setDesc("The note associated with this key.")
            .addText(text => {
                this.newNoteNameInput = text;
                text.setPlaceholder("e.g., My Shared Document")
                    .setValue(this.app.workspace.getActiveFile()?.basename || '');
            });

        new Setting(addKeySection)
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

        new Setting(addKeySection)
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
                                new Notice(`Key added: ${newKeyItem.id.substring(0, 8)}...`, 3000); // Still show partial in notice
                                this.newKeyIdInput.setValue(''); // Clear key input
                                this.newNoteNameInput.setValue(this.app.workspace.getActiveFile()?.basename || ''); // Reset note name
                                await this.renderKeyListContent(keyListDisplayContainer); // Re-render the key list
                            } else {
                                new Notice("Failed to add key. It might already exist (password collision).", 4000);
                            }
                        }
                    });
            });
    }

    private renderNoteRegistryContent(containerEl: HTMLElement): void {
        containerEl.empty();
        const registry = getNoteRegistry(this.plugin);

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
                            await deleteNoteFromRegistry(this.plugin, item.key);
                            new Notice(`Note "${item.key}" deleted from registry.`, 3000);
                            this.renderNoteRegistryContent(containerEl); // Re-render the registry list
                        }
                    });
            });
        }
    }


    private renderLinkNotePage(containerEl: HTMLElement): void {
        containerEl.createEl('h2', { text: 'Link / Pull a Collaborative Note' });

        // Back button
        new Setting(containerEl)
            .addButton(button => {
                button.setButtonText('← Back to Main Settings')
                    .onClick(() => {
                        this.currentPage = 'main';
                        this.display();
                    });
            });

        let linkNoteKeyInput: TextComponent;

        new Setting(containerEl)
            .setName('Share Key / Password')
            .setDesc('Enter the key/password for the shared note you want to link.')
            .addText(text => {
                linkNoteKeyInput = text;
                text.setPlaceholder('e.g., MyNoteName-192.168.1.100');
            });

        new Setting(containerEl)
            .addButton(button => {
                button.setButtonText('Pull Note')
                    .setCta()
                    .onClick(async () => { // Made async
                        const key = linkNoteKeyInput.getValue().trim();
                        if (!key) {
                            new Notice('Please enter a Share Key / Password to pull a note.', 3000);
                            return;
                        }

                        new Notice(`Attempting to pull note with key: ${key}...`, 3000);

                        try {
                            // Use the actual WebSocket client function
                            const content = await requestNoteFromPeer("ws://localhost:3010", key);

                            // Derive note name from the key (e.g., "NoteName-IP" -> "NoteName")
                            const noteNameParts = key.split('-');
                            const noteName = noteNameParts.length > 1 ? noteNameParts.slice(0, -1).join('-') : key; // Handle keys without IP

                            const sanitizedNoteName = noteName.replace(/[\\/:*?"<>|]/g, ''); // Basic sanitization
                            const filePath = `${sanitizedNoteName}.md`;
                            
                            let file: TFile | null = this.app.vault.getAbstractFileByPath(filePath) as TFile;
                            let overwrite = false;

                            if (file) {
                                // File exists, ask for overwrite confirmation
                                overwrite = await new Promise(resolve => {
                                    const confirmNotice = new Notice(
                                        `Note "${filePath}" already exists. Overwrite? (Click here to confirm)`,
                                        0 // Display indefinitely until clicked
                                    );
                                    confirmNotice.noticeEl.onclick = () => {
                                        confirmNotice.hide();
                                        resolve(true); // User confirms overwrite
                                    };
                                    // Auto-hide after some time if not clicked, and resolve to false
                                    setTimeout(() => {
                                        confirmNotice.hide();
                                        resolve(false);
                                    }, 7000); // 7 seconds to decide
                                });

                                if (!overwrite) {
                                    new Notice(`Pull cancelled for "${filePath}". Note not overwritten.`, 3000);
                                    return;
                                }
                            }

                            if (file && overwrite) {
                                await this.app.vault.modify(file, content);
                                new Notice(`Note "${filePath}" updated successfully!`, 3000);
                            } else {
                                file = await this.app.vault.create(filePath, content);
                                new Notice(`Note "${filePath}" created successfully!`, 3000);
                            }

                            // Open the created/updated note
                            if (file) {
                                this.app.workspace.openLinkText(file.path, '', false);
                            }

                        } catch (error) {
                            console.error('Error pulling note:', error);
                            new Notice(`An error occurred while pulling the note: ${error.message}`, 5000);
                        }
                    });
            });

        // REMOVED: "Generate Shareable Link (Copy to Clipboard)" button
    }
}
