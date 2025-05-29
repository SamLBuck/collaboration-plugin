import { App, PluginSettingTab, Setting, ButtonComponent, TextComponent, Notice } from 'obsidian';
import MyPlugin, { KeyItem } from '../main';
import { generateKey, addKey } from '../storage/keyManager';
import { KeyListModal } from './key_list_page02';
import { LinkNoteModal } from './link_note_page03';
import { shareCurrentNoteWithFileName } from '../utils/share_active_note';

export class PluginSettingsTab extends PluginSettingTab {
    static PLUGIN_ID = 'obsidian-collaboration-plugin-id'; 

    plugin: MyPlugin; 

    // Input references for the main settings page
    noteInput: TextComponent;
    // These properties are needed because the UI elements for them are active
    accessTypeView: HTMLInputElement;
    accessTypeEdit: HTMLInputElement;
    accessTypeViewAndComment: HTMLInputElement;
    accessTypeEditWithApproval: HTMLInputElement;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin; 
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.empty();

        this.renderMainSettingsPage(containerEl);
    }

    private renderMainSettingsPage(containerEl: HTMLElement): void {
        containerEl.createEl('h2', { text: 'Collaboration Settings' });

        containerEl.createEl('p', {
            text: 'Allows you to generate, manage, and link keys to specific notes for collaborative access control. You can generate new keys for selected notes with a specified access type, currently limited to View, and those keys are copied to your clipboard and saved locally AFTER YOUR KEY HAS BEEN MADE, YOU MUST MAKE EDITS TO THE NOTE LINKED. You can also view a list of all collaboration keys you have created, as well as notes that can be pullable with those keys. Link Note allows you to enter a shared key and access the note, it maintains a list of keys you have linked. We suggest sending created keys over email! IF YOU ARE HAVING CONNECTIVITY ISSUES, TRY RUNNING THE COMMAND STARTWEBSOCKETSERVER '
        })
        //Generate New Key
        new Setting(containerEl)
            .setName('Generate New Key')
            .setDesc('Generate a new key for the specified note and access type. The generated key will be copied to your clipboard and saved. Click on the Key List button to view and delete keys.')
            .addButton(button =>
                button
                    .setButtonText('Generate & Save') // Original button text
                    .setCta()
                    .onClick(async () => {
                        const noteName = this.noteInput.getValue().trim();
                        const accessType = this.getSelectedAccessType(); 

                        if (!noteName) {
                            new Notice('Please provide a Note Name to generate a key.', 4000);
                            return;
                        }
                        if (!accessType) { // Check if access type is selected
                            new Notice('Please select an Access Type to generate a key.', 4000);
                            return;
                        }

                        // Check for existing key with the same note and access type
                        const existingKey = this.plugin.settings.keys.find(
                            key => key.note === noteName && key.access === accessType
                        );
                        if (existingKey) {
                            new Notice(`A key for "${noteName}" with "${accessType}" access already exists. Cannot generate a duplicate. Existing Key: ${existingKey.ip}`, 8000);
                            await navigator.clipboard.writeText(existingKey.ip);
                            return;
                        }

                        try {
                            const newKeyItem = await generateKey(this.plugin, noteName, accessType);
                            const success = await addKey(this.plugin, newKeyItem);

                            if (success) {
                                new Notice(`Generated & Saved:\n${newKeyItem.ip}\nFor Note: "${newKeyItem.note}" (Access: ${newKeyItem.access})`, 8000);
                                await navigator.clipboard.writeText(newKeyItem.ip); // Copy to clipboard
                                shareCurrentNoteWithFileName(this.app, newKeyItem.note); 

                            } else {
                                 // but kept as a fallback for rare collision scenarios.
                                new Notice("Failed to add key. It might already exist (password collision).", 4000);
                            }
                        } catch (error: any) {
                            console.error("Error generating or adding key:", error);
                            new Notice(`Error: Could not generate key. ${error.message}`, 5000);
                        }
                    })
            );

        // Note Input
        new Setting(containerEl)
            .setName('Note')
            .setDesc('The note this key will be associated with. Make sure that your note title does not have spaces')
            .addText(text => {
                this.noteInput = text;
                text.setPlaceholder('Suggest Current Note...')
                    .setValue(this.app.workspace.getActiveFile()?.basename || '');
            })

        //Access Type
        const accessTypeSetting = new Setting(containerEl)
            .setName('Access Type')
            .setDesc('Select the type of access this key grants for the note. Only View can be selected at this time');

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
                    // Ensure only one checkbox is checked at a time
                    [this.accessTypeView, this.accessTypeEdit, this.accessTypeViewAndComment, this.accessTypeEditWithApproval].forEach(cb => {
                        if (cb && cb !== targetCheckbox) {
                            cb.checked = false;
                        }
                    });
                    new Notice(`Access type selected: ${name}`);
                } else {
                    // Prevent all checkboxes from being unchecked
                    const anyChecked = [this.accessTypeView, this.accessTypeEdit, this.accessTypeViewAndComment, this.accessTypeEditWithApproval].some(cb => cb?.checked);
                    if (!anyChecked) {
                        targetCheckbox.checked = true; // Re-check the current one if it's the last one
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
    
        //Navigation Buttons
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

        containerEl.createEl('p', {
            text: 'Use the buttons above to manage existing keys or use the key you have with Link Note.'
        });
        

        // //Automatic Note Registry Updates
        // new Setting(containerEl)
        //     .setName("Automatic Note Registry Updates")
        //     .setDesc("Automatically update the registry when a note is modified. We suggest that this is on, but you can disable it if you prefer manual updates.")
        //     .addToggle((toggle) =>
        //         toggle
        //             .setValue(this.plugin.settings.autoUpdateRegistry)
        //             .onChange(async (value) => {
        //                 this.plugin.settings.autoUpdateRegistry = value;
        //                 await this.plugin.saveSettings();
        //                 console.log(`[Settings] Auto-update registry set to ${value}`);
        //             })
        //     );

        containerEl.querySelectorAll('.setting-item').forEach(item => {
            (item as HTMLElement).style.marginBottom = '15px';
        });
    }

    // This method is now active again and reads from the checkboxes
    getSelectedAccessType(): string | null {
        if (this.accessTypeView.checked) return 'View';
        if (this.accessTypeEdit.checked) return 'Edit';
        if (this.accessTypeViewAndComment.checked) return 'View and Comment';
        if (this.accessTypeEditWithApproval.checked) return 'Edit w/ Approval';
        return null;
    }
    
}
function addStaticAccessLabel(container: HTMLElement, label: string) {
	const settingEl = container.createDiv("setting-item");
	settingEl.createDiv("setting-item-name").setText(label);
}

