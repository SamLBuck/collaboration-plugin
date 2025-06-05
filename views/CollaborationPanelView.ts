// views/CollaborationPanelView.ts
import { App, ItemView, WorkspaceLeaf, ButtonComponent, Notice, Setting, TextComponent, setIcon, TFile } from 'obsidian';
import MyPlugin, { deleteNoteFromRegistry } from '../main'; // Adjust this path if your 'main.ts' is not one level up
import { generateKey, addKey } from '../storage/keyManager';
import { shareCurrentNoteWithFileName } from '../utils/share_active_note';
import { requestNoteFromPeer } from '../networking/socket/client'; // Ensure this is imported

// Import the new view types for navigation
import { KEY_LIST_VIEW_TYPE } from './KeyListView';
import { LINK_NOTE_VIEW_TYPE } from './LinkNoteView';


export const COLLABORATION_VIEW_TYPE = 'collaboration-panel-view';

// Define types for note categorization
type NoteType = 'normal' | 'pushable' | 'pullable';

export class CollaborationPanelView extends ItemView {
    plugin: MyPlugin;
    activeNoteFile: TFile | null = null; // Store the active file
    noteType: NoteType = 'normal'; // Store the determined note type

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
        return 'share';
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass('collaboration-panel');

        // Initial determination of note type when the panel is opened
        this.activeNoteFile = this.app.workspace.getActiveFile();
        this.noteType = await this.determineNoteType(this.activeNoteFile);
        
        // Render the UI based on the determined note type
        this.renderPanelContent();

        // Register a file-open event listener to update the panel when a new note is opened
        this.registerEvent(
            this.app.workspace.on("file-open", async (file) => {
                if (file) {
                    this.activeNoteFile = file;
                    this.noteType = await this.determineNoteType(this.activeNoteFile);
                    this.renderPanelContent();
                }
            })
        );
    }

    async onClose(): Promise<void> {
        console.log('Collaboration Panel View closed');
    }

    // New method to determine the type of the active note
    private async determineNoteType(file: TFile | null): Promise<NoteType> {
        if (!file) {
            return 'normal'; // No file open, consider it normal/generic
        }

        const noteName = file.basename;

        // Check if a key has been generated for this note (pushable)
        const isPushable = this.plugin.settings.keys.some(keyItem => keyItem.note === noteName);
        if (isPushable) {
            return 'pushable';
        }

        // Check if this note has been pulled/linked from an external source (pullable)
        const isPullable = this.plugin.settings.linkedKeys.some(keyItem => keyItem.note === noteName);
        if (isPullable) {
            return 'pullable';
        }

        return 'normal'; // Default if neither pushable nor pullable
    }

    // New method to render the appropriate UI based on note type
    private renderPanelContent(): void {
        this.contentEl.empty(); // Clear existing content

        this.contentEl.createEl('h1', { text: `Control Panel for: ${this.activeNoteFile?.basename || 'No Note Open'}` });
        this.contentEl.createEl('p', { text: `Note Type: ${this.noteType.charAt(0).toUpperCase() + this.noteType.slice(1)}` });
        this.contentEl.createEl('hr');

        switch (this.noteType) {
            case 'pushable':
                this.renderPushableNotePanel();
                break;
            case 'pullable':
                this.renderPullableNotePanel();
                break;
            case 'normal':
            default:
                this.renderNormalNotePanel();
                break;
        }

        // Always include navigation buttons at the bottom for consistency
        this.renderNavigationButtons();

        // Always include Automatic Note Registry Updates for consistency
        this.renderAutomaticUpdatesSection();
    }

    private renderNormalNotePanel(): void {
        this.contentEl.createEl('h2', { text: 'Create New Shareable Note' });
        this.contentEl.createEl('p', { text: 'This note is not currently shared. Generate a new key to share it.' });
        
        // Original Generate New Key section
        new Setting(this.contentEl)
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
                                await navigator.clipboard.writeText(newKeyItem.ip);
                                shareCurrentNoteWithFileName(this.plugin, this.app, newKeyItem.note);
                                // After generating, re-render to potentially switch to 'pushable' panel
                                this.activeNoteFile = this.app.workspace.getActiveFile();
                                this.noteType = await this.determineNoteType(this.activeNoteFile);
                                this.renderPanelContent();
                            } else {
                                new Notice("Failed to add key. It might already exist (password collision).", 4000);
                            }
                        } catch (error: any) {
                            console.error("Error generating or adding key:", error);
                            new Notice(`Error: Could not generate key. ${error.message}`, 5000);
                        }
                    })
            );

        new Setting(this.contentEl)
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

        const accessTypeSetting = new Setting(this.contentEl)
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
    }

    private renderPushableNotePanel(): void {
        const noteName = this.activeNoteFile?.basename || '';
        const keyItem = this.plugin.settings.keys.find(k => k.note === noteName);

        this.contentEl.createEl('h2', { text: 'Pushable Note Tools' });
        this.contentEl.createEl('p', { text: `This note ("${noteName}") has a key associated with it. You can push changes.` });
        
        if (keyItem) {
             this.contentEl.createEl('p', { text: `Key: ${keyItem.ip} (Access: ${keyItem.access})` });

            new Setting(this.contentEl)
                .setName('Share Current Note')
                .setDesc('Push the current changes of this note to connected peers.')
                .addButton(button =>
                    button
                        .setButtonText('Push Changes')
                        .setCta()
                        .onClick(async () => {
                            if (this.activeNoteFile) {
                                await shareCurrentNoteWithFileName(this.plugin, this.app, this.activeNoteFile.basename);
                                new Notice(`Pushed changes for "${this.activeNoteFile.basename}".`);
                            } else {
                                new Notice("No active note to push changes for.", 4000);
                            }
                        })
                );
            
            new Setting(this.contentEl)
                .setName('Delete Key')
                .setDesc('Delete the key associated with this note. It will no longer be shareable via this key.')
                .addButton(button =>
                    button
                        .setButtonText('Delete Key')
                        .setWarning()
                        .onClick(async () => {
                            if (keyItem) {
                                await deleteNoteFromRegistry(this.plugin, keyItem.ip); // Use the full key (ip) to delete
                                new Notice(`Key for "${noteName}" deleted.`);
                                // After deletion, re-render to potentially switch to 'normal' panel
                                this.activeNoteFile = this.app.workspace.getActiveFile();
                                this.noteType = await this.determineNoteType(this.activeNoteFile);
                                this.renderPanelContent();
                            }
                        })
                );
        } else {
            this.contentEl.createEl('p', { text: 'Error: Key not found for this pushable note.' });
        }
    }

    private renderPullableNotePanel(): void {
        const noteName = this.activeNoteFile?.basename || '';
        const keyItem = this.plugin.settings.linkedKeys.find(k => k.note === noteName);

        this.contentEl.createEl('h2', { text: 'Pullable Note Tools' });
        this.contentEl.createEl('p', { text: `This note ("${noteName}") has been pulled from a peer. You can pull the latest changes.` });

        if (keyItem) {
            this.contentEl.createEl('p', { text: `Source Key: ${keyItem.ip} (Access: ${keyItem.access})` });

            new Setting(this.contentEl)
                .setName('Pull Latest Changes')
                .setDesc('Retrieve the latest version of this note from the original source.')
                .addButton(button =>
                    button
                        .setButtonText('Pull Changes')
                        .setCta()
                        .onClick(async () => {
                            if (keyItem) {
                                // Corrected order of arguments: key (string) then plugin (MyPlugin instance)
                                await requestNoteFromPeer(keyItem.ip, keyItem.note);
                                new Notice(`Requested latest changes for "${noteName}".`);
                            } else {
                                new Notice("Could not find key for this pullable note.", 4000);
                            }
                        })
                );
        } else {
            this.contentEl.createEl('p', { text: 'Error: Linked key not found for this pullable note.' });
        }
    }

    private renderNavigationButtons(): void {
        this.contentEl.createEl('h2', { text: 'Navigation' });
        const navButtonContainer = this.contentEl.createDiv({ cls: 'settings-nav-buttons' });
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

        this.contentEl.createEl('p', {
            text: 'Use the buttons above to manage existing keys or use the key you have with Link Note.'
        });
    }

    private renderAutomaticUpdatesSection(): void {
        this.contentEl.createEl('h2', { text: 'Automatic Updates' });
        new Setting(this.contentEl)
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
    }


    getSelectedAccessType(): string | null {
        if (this.accessTypeView.checked) return 'View';
        if (this.accessTypeEdit.checked) return 'Edit';
        if (this.accessTypeViewAndComment.checked) return 'View and Comment';
        if (this.accessTypeEditWithApproval.checked) return 'Edit w/ Approval';
        return null;
    }
}
