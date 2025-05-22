// settings/main_page01.ts

import { App, Modal, Setting, TextComponent, TextAreaComponent, ButtonComponent, Notice } from 'obsidian';
import MyPlugin, { KeyItem } from '../main'; // Import your main plugin class and KeyItem
import { generateKey, addKey } from '../storage/keyManager'; // Import generateKey and addKey

export class SettingsModal extends Modal {
    plugin: MyPlugin;

    keyInput: TextComponent;
    noteInput: TextComponent;
    accessTypeView: HTMLInputElement;
    accessTypeEdit: HTMLInputElement;
    accessTypeViewAndComment: HTMLInputElement;
    accessTypeEditWithApproval: HTMLInputElement;

    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        console.log('SettingsModal: Opening main settings page.');
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Collaboration Settings' });

        // --- Key Section ---
        new Setting(contentEl)
            .setName('Key ID') // Changed name for clarity
            .setDesc('This is the unique ID for the key.')
            .addText(text => {
                this.keyInput = text;
                text.setPlaceholder('Leave blank for auto-generate')
                    .setValue('');
            });

        // --- Note Section ---
        new Setting(contentEl)
            .setName('Note Name') // Changed name for clarity
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

        // --- Access Type Section ---
        const accessTypeSetting = new Setting(contentEl)
            .setName('Access Type')
            .setDesc('Select the type of access this key grants for the note.');

        const checkboxContainer = accessTypeSetting.controlEl.createDiv({ cls: 'access-type-checkboxes' });
        checkboxContainer.style.display = 'flex';
        checkboxContainer.style.flexDirection = 'column';
        checkboxContainer.style.gap = '8px';

        const createCheckbox = (name: string, description: string, checked: boolean = false): HTMLInputElement => {
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
                }
            };
            return checkbox;
        };

        this.accessTypeView = createCheckbox('View', 'Allows viewing the note.');
        this.accessTypeEdit = createCheckbox('Edit', 'Allows editing the note.', true);
        this.accessTypeViewAndComment = createCheckbox('View and Comment', 'Allows viewing and adding comments.');
        this.accessTypeEditWithApproval = createCheckbox('Edit w/ Approval', 'Allows editing, but changes require approval.');

        // --- Generate and Add Key Button ---
        new Setting(contentEl)
            .setName('Generate and Add Key')
            .setDesc('Creates a new unique key based on inputs and adds it to your collection.')
            .addButton(button => {
                button.setButtonText('Generate & Add')
                    .setCta()
                    .onClick(async () => {
                        const noteName = this.keyInput.getValue().trim();
                        const accessType = this.getSelectedAccessType();
                        const customKeyId = this.keyInput.getValue().trim(); // Get user-entered key ID if any

                        if (!noteName || !accessType) {
                            new Notice('Please provide a Note Name and select an Access Type.', 4000);
                            return;
                        }

                        let newKeyItem: KeyItem;

                        if (customKeyId) { // If user provided a key ID, use it for manual add
                            newKeyItem = { id: customKeyId, note: noteName, access: accessType };
                            // Add key to manager (will check for duplicates and save)
                            await addKey(this.plugin, newKeyItem);
                            this.close(); // Close modal after adding
                        } else { // Generate a new key
                            // Generate the KeyItem
                            newKeyItem = await generateKey(this.plugin, noteName, accessType);
                            // Add the generated KeyItem to manager (will save)
                            await addKey(this.plugin, newKeyItem);
                            this.keyInput.setValue(newKeyItem.id); // Show generated key in the input
                            this.close(); // Close modal after adding
                        }
                    });
            });


        // --- Navigation Buttons ---
        const navButtonContainer = contentEl.createDiv({ cls: 'settings-nav-buttons' });
        navButtonContainer.style.display = 'flex';
        navButtonContainer.style.justifyContent = 'space-between';
        navButtonContainer.style.marginTop = '20px';

        // Use a container for the buttons on the left
        const leftButtons = navButtonContainer.createDiv();
        new Setting(leftButtons)
            .addButton(button => {
                button.setButtonText('List of keys')
                    .onClick(async () => {
                        const { KeyListModal } = await import('./key_list_page02');
                        this.close();
                        new KeyListModal(this.app, this.plugin).open();
                    });
            });

        // Use a container for the buttons on the right
        const rightButtons = navButtonContainer.createDiv();
        new Setting(rightButtons)
            .addButton(button => {
                button.setButtonText('Link Note')
                    .onClick(async () => {
                        const { LinkNoteModal } = await import('./link_note_page03');
                        this.close();
                        new LinkNoteModal(this.app, this.plugin).open();
                    });
            });

        // Append the button containers to the nav container
        navButtonContainer.appendChild(leftButtons);
        navButtonContainer.appendChild(rightButtons);


        // Basic styling for better appearance within the modal
        contentEl.querySelectorAll('.setting-item').forEach(item => {
            (item as HTMLElement).style.marginBottom = '15px';
        });
        // Adjust width of text inputs within settings
        contentEl.querySelectorAll('input[type="text"]').forEach(input => {
            (input as HTMLElement).style.width = 'calc(100% - 120px)'; // Adjust width to leave space for label
        });
        contentEl.querySelector('select')!.style.width = 'calc(100% - 120px)'; // Adjust width for select box


    }

    onClose() {
        console.log('SettingsModal: Closing main settings page.');
        const { contentEl } = this;
        contentEl.empty();
    }

    getSelectedAccessType(): string | null {
        if (this.accessTypeView.checked) return 'View';
        if (this.accessTypeEdit.checked) return 'Edit';
        if (this.accessTypeViewAndComment.checked) return 'View and Comment';
        if (this.accessTypeEditWithApproval.checked) return 'Edit w/ Approval';
        return null;
    }
}