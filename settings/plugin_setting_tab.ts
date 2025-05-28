import { App, PluginSettingTab, Setting, ButtonComponent, TextComponent, Notice } from 'obsidian';
import MyPlugin, { KeyItem } from '../main';
import { generateKey, addKey } from '../storage/keyManager'; // Ensure addKey is imported if used directly here
import { KeyListModal } from './key_list_page02';
import { LinkNoteModal } from './link_note_page03';
import { shareCurrentNoteWithFileName } from '../utils/share_active_note';

export class PluginSettingsTab extends PluginSettingTab {
    // IMPORTANT: This ID should be unique to your plugin and should match the 'id' field in your manifest.json.
    // Replace 'obsidian-collaboration-plugin-id' with your actual plugin ID.
    static PLUGIN_ID = 'obsidian-collaboration-plugin-id'; // <--- Ensure this matches your manifest.json ID

    plugin: MyPlugin; // <--- ENSURE THIS IS DECLARED

    // Input references for the main settings page
    // Removed: keyInput: TextComponent; // No longer needed for manual input
    noteInput: TextComponent;
    accessTypeView: HTMLInputElement;
    accessTypeEdit: HTMLInputElement;
    accessTypeViewAndComment: HTMLInputElement;
    accessTypeEditWithApproval: HTMLInputElement;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin; // <--- ENSURE THIS IS INITIALIZED
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty(); // Clear existing content

        this.renderMainSettingsPage(containerEl);
    }

    private renderMainSettingsPage(containerEl: HTMLElement): void {
        containerEl.createEl('h2', { text: 'Collaboration Settings' });

        // --- SECTION: Generate New Key ---
        new Setting(containerEl)
            .setName('Generate New Key')
            .setDesc('Generate a new key (IP-NoteName format) for the specified note and access type. The generated key will be copied to your clipboard and saved.')
            .addButton(button =>
                button
                    .setButtonText('Generate')
                    .setCta()
                    .onClick(async () => {
                        const noteName = this.noteInput.getValue().trim();
                        const accessType = this.getSelectedAccessType(); // <--- THIS METHOD IS NOW INCLUDED

                        if (!noteName) {
                            new Notice('Please provide a Note Name to generate a key.', 4000);
                            return;
                        }
                        if (!accessType) {
                            new Notice('Please select an Access Type to generate a key.', 4000);
                            return;
                        }

                        // Check for existing key with the same note and access type
                        const existingKey = this.plugin.settings.keys.find( // we can refigure this to check our actual stored data
                            key => key.note === noteName && key.access === accessType
                        );
                        if (existingKey) {
                            new Notice(`A key for "${noteName}" with "${accessType}" access already exists. Cannot generate a duplicate. Existing Key: ${existingKey.ip}`, 8000);
                            await navigator.clipboard.writeText(existingKey.ip); // Copy existing key if it's a duplicate
                            return;
                        }

                        try {
                            const newKeyItem = await generateKey(this.plugin, noteName, accessType); // <--- newKeyItem WILL BE KeyItem
                            const success = await addKey(this.plugin, newKeyItem);

                            if (success) {
                                new Notice(`Generated & Saved:\n${newKeyItem.ip}\nFor Note: "${newKeyItem.note}" (Access: ${newKeyItem.access})`, 8000);
                                await navigator.clipboard.writeText(newKeyItem.ip); // Copy to clipboard
                                shareCurrentNoteWithFileName(this.app, newKeyItem.note); // Assuming this function exists to share the current note

                            } else {
                                // This case should ideally not be reached due to the existingKey check above,
                                // but kept as a fallback for rare collision scenarios.
                                new Notice("Failed to add key. It might already exist (password collision).", 4000);
                            }
                        } catch (error: any) {
                            console.error("Error generating or adding key:", error);
                            new Notice(`Error: Could not generate key. ${error.message}`, 5000);
                        }
                    })
            );

        // --- SECTION: Note Input ---
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

        // --- SECTION: Access Type ---
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

        this.accessTypeView = createCheckbox('View', true);
        this.accessTypeEdit = createCheckbox('Edit', false);
        this.accessTypeViewAndComment = createCheckbox('View and Comment', false);
        this.accessTypeEditWithApproval = createCheckbox('Edit w/ Approval', false);

        // --- SECTION: Navigation Buttons ---
        const navButtonContainer = containerEl.createDiv({ cls: 'settings-nav-buttons' });
        navButtonContainer.style.display = 'flex';
        navButtonContainer.style.justifyContent = 'space-between';
        navButtonContainer.style.marginTop = '20px';

        const leftButtons = navButtonContainer.createDiv();
        new Setting(leftButtons)
            .addButton(button => {
                button.setButtonText('List of keys')
                    .onClick(() => {
                        new KeyListModal(this.app, this.plugin).open();
                    });
            });

        const rightButtons = navButtonContainer.createDiv();
        new Setting(rightButtons)
            .addButton(button => {
                button.setButtonText('Link Note')
                    .onClick(() => {
                        new LinkNoteModal(this.app, this.plugin).open();
                    });
            });

        navButtonContainer.appendChild(leftButtons);
        navButtonContainer.appendChild(rightButtons);

        // --- SECTION: Automatic Note Registry Updates ---
        new Setting(containerEl)
            .setName("Automatic Note Registry Updates")
            .setDesc("Automatically update the registry when a note is modified.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.autoUpdateRegistry)
                    .onChange(async (value) => {
                        this.plugin.settings.autoUpdateRegistry = value;
                        await this.plugin.saveSettings();
                        console.log(`[Settings] Auto-update registry set to ${value}`);
                    })
            );

        containerEl.querySelectorAll('.setting-item').forEach(item => {
            (item as HTMLElement).style.marginBottom = '15px';
        });
    }

    // <--- ENSURE THIS METHOD IS PRESENT WITHIN THE CLASS
    getSelectedAccessType(): string | null {
        if (this.accessTypeView.checked) return 'View';
        if (this.accessTypeEdit.checked) return 'Edit';
        if (this.accessTypeViewAndComment.checked) return 'View and Comment';
        if (this.accessTypeEditWithApproval.checked) return 'Edit w/ Approval';
        return null;
    }
}
