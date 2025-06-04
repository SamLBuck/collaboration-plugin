import { App, ItemView, WorkspaceLeaf, ButtonComponent, Notice, Setting, TextComponent } from 'obsidian';
import MyPlugin from '../main';
import { generateKey, addKey } from '../storage/keyManager';
import { shareCurrentNoteWithFileName } from '../utils/share_active_note';

// Import the new view types for navigation
import { KEY_LIST_VIEW_TYPE } from './KeyListView';
import { LINK_NOTE_VIEW_TYPE } from './LinkNoteView';


export const COLLABORATION_VIEW_TYPE = 'collaboration-panel-view';

export class CollaborationPanelView extends ItemView {
    plugin: MyPlugin;

    // Properties for Generate New Key section (from PluginSettingsTab)
    noteInput: TextComponent;
    accessTypeView: HTMLInputElement;
    accessTypeEdit: HTMLInputElement;
    accessTypeViewAndComment: HTMLInputElement;
    accessTypeEditWithApproval: HTMLInputElement;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return COLLABORATION_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Collaboration Panel';
    }

    getIcon(): string {
        return 'layout-dashboard'; 
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('collaboration-panel'); // Add a class for potential styling

        // --- SECTION: Descriptive Paragraph (from PluginSettingsTab) ---
        contentEl.createEl('p', {
            text: 'Allows you to generate, manage, and link keys to specific notes for collaborative access control. You can generate new keys for selected notes with a specified access type, and those keys are copied to your clipboard and saved locally. Use the navigation buttons below to view your key lists or link notes.'
        });

        // --- SECTION: Generate New Key (from PluginSettingsTab) ---
        contentEl.createEl('h2', { text: 'Generate New Key' });
        new Setting(contentEl)
            .setName('Generate New Key')
            .setDesc('Generate a new key (IP-NoteName format) for the specified note and access type. The generated key will be copied to your clipboard and saved.')
            .addButton(button =>
                button
                    .setButtonText('Generate & Save')
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
                                shareCurrentNoteWithFileName(this.plugin, this.app, newKeyItem.note); // Share the current note
                                // No direct refresh of key/registry lists here, as they are in a separate view
                            } else {
                                new Notice("Failed to add key. It might already exist (password collision).", 4000);
                            }
                        } catch (error: any) {
                            console.error("Error generating or adding key:", error);
                            new Notice(`Error: Could not generate key. ${error.message}`, 5000);
                        }
                    })
            );

        // Note Input (from PluginSettingsTab)
        new Setting(contentEl)
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

        // Access Type (from PluginSettingsTab)
        const accessTypeSetting = new Setting(contentEl)
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

        this.accessTypeView = createCheckbox('View', true); 
        this.accessTypeEdit = createCheckbox('Edit', false); 
        this.accessTypeViewAndComment = createCheckbox('View and Comment', false);
        this.accessTypeEditWithApproval = createCheckbox('Edit w/ Approval', false);

        // --- SECTION: Navigation Buttons (to other views) ---
        contentEl.createEl('h2', { text: 'Navigation' });
        const navButtonContainer = contentEl.createDiv({ cls: 'settings-nav-buttons' });
        navButtonContainer.style.display = 'flex';
        navButtonContainer.style.justifyContent = 'space-between';
        navButtonContainer.style.marginTop = '20px';

        const leftButtons = navButtonContainer.createDiv();
        new Setting(leftButtons)
            .addButton(button => {
                button.setButtonText('List of keys')
                    .onClick(() => {
                        this.plugin.activateView(KEY_LIST_VIEW_TYPE); // Navigate to KeyListView
                    });
            });

        const rightButtons = navButtonContainer.createDiv();
        new Setting(rightButtons)
            .addButton(button => {
                button.setButtonText('Link Note')
                    .onClick(() => {
                        this.plugin.activateView(LINK_NOTE_VIEW_TYPE); // Navigate to LinkNoteView
                    });
            });

        navButtonContainer.appendChild(leftButtons);
        navButtonContainer.appendChild(rightButtons);

        // New Descriptive Paragraph for Navigation Buttons (from PluginSettingsTab)
        contentEl.createEl('p', {
            text: 'Use the buttons above to manage existing keys or use the key you have with Link Note.'
        });

        // --- SECTION: Automatic Note Registry Updates (from PluginSettingsTab) ---
        contentEl.createEl('h2', { text: 'Automatic Updates' });
        new Setting(contentEl)
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

        // Removed direct display of key list and registry from this panel
        // this.keyListContainer = contentEl.createDiv({ cls: 'key-list-container' });
        // await this.renderKeyListContent(this.keyListContainer);
        // this.registryDisplayContainer = contentEl.createDiv({ cls: 'note-registry-container' });
        // await this.renderNoteRegistryContent(this.registryDisplayContainer);
    }

    async onClose(): Promise<void> {
        console.log('Collaboration Panel View closed');
    }

    // This panel no longer needs refreshDisplay as it doesn't show dynamic lists directly
    // async refreshDisplay(): Promise<void> {
    //     console.log('Refreshing Collaboration Panel display...');
    // }

    // Method to get selected access type (from PluginSettingsTab)
    getSelectedAccessType(): string | null {
        if (this.accessTypeView.checked) return 'View';
        if (this.accessTypeEdit.checked) return 'Edit';
        if (this.accessTypeViewAndComment.checked) return 'View and Comment';
        if (this.accessTypeEditWithApproval.checked) return 'Edit w/ Approval';
        return null;
    }
}
