import { App, PluginSettingTab, Setting, ButtonComponent, TextComponent, Notice } from 'obsidian';
import MyPlugin, { KeyItem } from '../main';
import { generateKey, addKey } from '../storage/keyManager'; // Only need generate/add for this tab

// Import the new Modals to open them from buttons within the settings tab
import { KeyListModal } from '../settings/key_list_page02';
import { LinkNoteModal } from '../settings/link_note_page03';


export class PluginSettingsTab extends PluginSettingTab {
    // IMPORTANT: This ID should be unique to your plugin and should match the 'id' field in your manifest.json.
    // Replace 'obsidian-collaboration-plugin-id' with your actual plugin ID.
    static PLUGIN_ID = 'obsidian-collaboration-plugin-id'; // <--- Ensure this matches your manifest.json ID

    plugin: MyPlugin;

    // Input references for the main settings page
    keyInput: TextComponent;
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
        containerEl.empty(); // Clear existing content

        this.renderMainSettingsPage(containerEl); // Only render the main page now
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
                        new Notice(`Generated & Saved: ${newKeyItem.id}\nFor Note: "${newKeyItem.note}"`, 8000);
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
                        // Open the KeyListModal directly from here
                        new KeyListModal(this.app, this.plugin).open(); // <--- Opens the modal pop-up
                    });
            });

        const rightButtons = navButtonContainer.createDiv();
        new Setting(rightButtons)
            .addButton(button => {
                button.setButtonText('Link Note')
                    .onClick(() => {
                        // Open the LinkNoteModal directly from here
                        new LinkNoteModal(this.app, this.plugin).open(); // <--- Opens the modal pop-up
                    });
            });

        navButtonContainer.appendChild(leftButtons);
        navButtonContainer.appendChild(rightButtons);

        // New toggle setting for automatic Note Registry Updates
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

    getSelectedAccessType(): string | null {
        if (this.accessTypeView.checked) return 'View';
        if (this.accessTypeEdit.checked) return 'Edit';
        if (this.accessTypeViewAndComment.checked) return 'View and Comment';
        if (this.accessTypeEditWithApproval.checked) return 'Edit w/ Approval';
        return null;
    }
}