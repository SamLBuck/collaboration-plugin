import { App, PluginSettingTab, Setting, ButtonComponent, TextComponent, Notice } from 'obsidian';
import MyPlugin, { KeyItem } from '../main';
import { generateKey, addKey } from '../storage/keyManager'; // Ensure addKey is imported if used directly here
import { KeyListModal } from './key_list_page02';
import { LinkNoteModal } from './link_note_page03';
import { shareCurrentNoteWithFileName } from '../utils/share_active_note';

export class PluginSettingsTab extends PluginSettingTab {
    static PLUGIN_ID = 'obsidian-collaboration-plugin-id'; 

    plugin: MyPlugin; 

    // Input references for the main settings page
    noteInput: TextComponent;
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

        this.renderMainSettingsPage(containerEl);
    }

    private renderMainSettingsPage(containerEl: HTMLElement): void {
        containerEl.createEl('h2', { text: 'Collaboration Settings' });
        containerEl.createEl('h3', { text: 'Before attmepting to Generate note link, Please run command Start WebSocket Server' });

        containerEl.createEl('p', {
            text: 'Allows you to generate, manage, and link keys to specific notes for collaborative access control. You can generate new keys for selected notes with a specified access type, currently limited to View, and those keys are copied to your clipboard and saved locally. You can also view a list of all collaboration keys you have created, as well notes that can be pullable with those keys. Link Note allows you to enter a shared key and access the note, it maintains a list of keys you have linked. Theres a toggle to enable or disable automatic updates to the note registry whenever a note with a created key is modified.'
        })
        //Generate New Key
        new Setting(containerEl)
            .setName('Generate New Key')
            .setDesc('Generate a new key for the specified note and access type. The generated key will be copied to your clipboard and saved. Click on the Key List button to view all keys.')
            .addButton(button =>
                button
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
            .addButton(button => {
                button.setIcon('refresh-cw')
                    .setTooltip('Suggest Current Note')
                    .onClick(() => {
                        this.noteInput.setValue(this.app.workspace.getActiveFile()?.basename || '');
                        new Notice('Suggested current note!');
                    });
            });

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

        new Setting(containerEl)
        .setName("View")
        .addToggle(toggle => {
            toggle.setValue(true);
            toggle.setDisabled(true); // show as selected and unclickable
        });
    
    addStaticAccessLabel(containerEl, "Edit");
    addStaticAccessLabel(containerEl, "View and Comment");
    addStaticAccessLabel(containerEl, "Edit w/ Approval");
    
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
        

        //Automatic Note Registry Updates
        new Setting(containerEl)
            .setName("Automatic Note Registry Updates")
            .setDesc("Automatically update the registry when a note is modified. We suggest that this is on, but you can disable it if you prefer manual updates.")
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
function addStaticAccessLabel(container: HTMLElement, label: string) {
	const settingEl = container.createDiv("setting-item");
	settingEl.createDiv("setting-item-name").setText(label);
}

