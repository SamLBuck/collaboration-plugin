// views/CollaborationPanelView.ts
import { App, ItemView, WorkspaceLeaf, ButtonComponent, Notice, Setting, TextComponent, setIcon, TFile, Modal } from 'obsidian';
import MyPlugin from '../main';
import { generateKey, addKey, deleteKeyAndContent } from '../storage/keyManager';
import { shareCurrentNoteWithFileName } from '../utils/share_active_note';
import { requestNoteFromPeer } from '../networking/socket/client';

import { KEY_LIST_VIEW_TYPE } from './KeyListView';
import { LINK_NOTE_VIEW_TYPE } from './LinkNoteView';
import { parseKey } from '../utils/parse_key';
import { rewriteExistingNote } from '../utils/pull_note_command';

// --- INLINED: ConfirmationModal class definition (consistent with other views) ---
class ConfirmationModal extends Modal {
    message: string;
    callback: (confirmed: boolean) => void;

    constructor(app: App, message: string, callback: (confirmed: boolean) => void) {
        super(app);
        this.message = message;
        this.callback = callback;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Confirmation' });
        contentEl.createEl('p', { text: this.message });
        new Setting(contentEl)
            .addButton(button => {
                button.setButtonText('Confirm').setCta().setClass('mod-warning').onClick(() => {
                    this.callback(true);
                    this.close();
                });
            })
            .addButton(button => {
                button.setButtonText('Cancel').onClick(() => {
                    this.callback(false);
                    this.close();
                });
            });
    }
    onClose() {
        this.contentEl.empty();
    }
}
// --- END INLINED: ConfirmationModal class definition ---

export const COLLABORATION_VIEW_TYPE = 'collaboration-panel-view';

// Define types for note categorization with new names
type NoteType = 'none' | 'owner' | 'collaborator'; // CHANGED: 'push' to 'owner', 'pulled' to 'collaborator'

export class CollaborationPanelView extends ItemView {
    plugin: MyPlugin;
    activeNoteFile: TFile | null = null;
    noteType: NoteType = 'none';

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

        this.activeNoteFile = this.app.workspace.getActiveFile();
        this.noteType = await this.determineNoteType(this.activeNoteFile);
        
        this.renderPanelContent();

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

    private async determineNoteType(file: TFile | null): Promise<NoteType> {
        if (!file) {
            return 'none';
        }

        const noteName = file.basename;

        const isOwner = this.plugin.settings.keys.some(keyItem => keyItem.note === noteName); // has the status of no type
        if (isOwner) {
            return 'owner'; // has the status of push
        }

        const isCollaborator = this.plugin.settings.linkedKeys.some(keyItem => keyItem.note === noteName); // CHANGED: isPullable to isCollaborator
        if (isCollaborator) {
            return 'collaborator'; // has the status of a pulled note
        }

        return 'none';
    }

    private renderPanelContent(): void {
        this.contentEl.empty();

        this.contentEl.createEl('h1', { text: `Control Panel` });
        
        let displayNoteTypeName: string;
        switch (this.noteType) {
            case 'none':
                displayNoteTypeName = 'None';
                break;
            case 'owner': // CHANGED: 'push' to 'owner'
                displayNoteTypeName = 'Owner'; // CHANGED: 'Push' to 'Owner'
                break;
            case 'collaborator': // CHANGED: 'pulled' to 'collaborator'
                displayNoteTypeName = 'Collaborator'; // CHANGED: 'Pulled' to 'Collaborator'
                break;
            default:
                displayNoteTypeName = 'Unknown';
        }
        //this.contentEl.createEl('p', { text: `Note Type: ${displayNoteTypeName}` });

        this.contentEl.createEl('hr');

        switch (this.noteType) {
            case 'owner': // CHANGED: 'push' to 'owner'
                this.renderOwnerNotePanel(); // CHANGED: renderPushNotePanel to renderOwnerNotePanel
                break;
            case 'collaborator': // CHANGED: 'pulled' to 'collaborator'
                this.renderCollaboratorNotePanel(); // CHANGED: renderPulledNotePanel to renderCollaboratorNotePanel
                break;
            case 'none':
            default:
                this.renderNoneNotePanel();
                break;
        }

        this.renderNavigationButtons();
        this.renderAutomaticUpdatesSection();
    }

    private renderNoneNotePanel(): void {
        this.contentEl.createEl('h2', { text: 'Create New Shareable Note' });
        this.contentEl.createEl('p', { text: 'This note is not currently shared. Generate a new key to share it.' });
        
        new Setting(this.contentEl)
            .setName('Generate New Key')
            .setDesc('Generate a new key for the specified note and access type. The generated key will be copied to your clipboard and saved.')
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
        //this.accessTypeViewAndComment = createCheckbox('View and Comment', false);
        //this.accessTypeEditWithApproval = createCheckbox('Edit w/ Approval', false);
    }

    // CHANGED: Renamed from renderPushNotePanel to renderOwnerNotePanel
    private renderOwnerNotePanel(): void {
        const noteName = this.activeNoteFile?.basename || '';
        const keyItem = this.plugin.settings.keys.find(k => k.note === noteName);

        this.contentEl.createEl('h2', { text: 'Owner Note Tools' }); // CHANGED: 'Push Note Tools' to 'Owner Note Tools'
        this.contentEl.createEl('p', { text: `This note ("${noteName}") has a key associated with it. You are the host.` });
        
        if (keyItem) {
            this.contentEl.createEl('p', { text: `Your Key: ${keyItem.ip} (Access: ${keyItem.access})` });
            
            new Setting(this.contentEl)
                .setName('Delete Key & Registry Content') 
                .setDesc('Delete the key associated with this note AND remove its content from your local sharing registry. It will no longer be shareable via this key.') 
                .addButton(button =>
                    button
                        .setButtonText('Delete Key & Content') 
                        .setWarning()
                        .onClick(async () => {
                            if (keyItem) {
                                const confirmDelete = await new Promise<boolean>(resolve => {
                                    new ConfirmationModal(this.app, `Are you sure you want to delete the key for "${noteName}" AND remove its content from your local sharing registry? This action cannot be undone.`, resolve).open(); 
                                });

                                if (confirmDelete) {
                                    const deleted = await deleteKeyAndContent(this.plugin, keyItem.note);
                                    if (deleted) {
                                        new Notice(`Key for "${noteName}" and its content deleted from registry.`, 5000);
                                        this.activeNoteFile = this.app.workspace.getActiveFile();
                                        this.noteType = await this.determineNoteType(this.activeNoteFile);
                                        this.renderPanelContent();
                                    } else {
                                        new Notice(`Failed to delete key for "${noteName}". It might not exist.`, 4000);
                                    }
                                } else {
                                    new Notice("Deletion cancelled.", 2000);
                                }
                            }
                        })
                );
        } else {
            this.contentEl.createEl('p', { text: 'Error: Key not found for this owned note.' }); // CHANGED: pushable to owned
        }
    }

    // CHANGED: Renamed from renderPulledNotePanel to renderCollaboratorNotePanel
    private renderCollaboratorNotePanel(): void {
        const noteName = this.activeNoteFile?.basename || '';
        const keyItem = this.plugin.settings.linkedKeys.find(k => k.note === noteName);

        this.contentEl.createEl('h2', { text: 'Tools' }); // CHANGED: 'Pulled Note Tools' to 'Collaborator Note Tools'
        this.contentEl.createEl('p', { text: `"${noteName}"has been pulled. You can pull the latest changes.` });

        if (keyItem) {
            this.contentEl.createEl('p', { text: `${keyItem.ip}` });

            // --- START MOVED: Push Changes Button ---
            new Setting(this.contentEl)
                .setName('Share Changes ')
                //.setDesc('')
                .addButton(button =>
                    button
                        .setButtonText('Push Changes')
                        .setCta()
                        .onClick(async () => {
                            const input = keyItem.ip; // Use the pulled key's IP for pushing back
                            if (!input) {
                                new Notice("Could not determine source key to push changes.", 3000);
                                return;
                            }
        
                            let parsedKeyInfo;
                            try {
                                parsedKeyInfo = parseKey(input);
                                if (!parsedKeyInfo || !parsedKeyInfo.ip || !parsedKeyInfo.noteName) {
                                    throw new Error('Invalid key format. Expected "IP-NoteName".');
                                }
                            } catch (error: any) {
                                new Notice(`Key parsing error: ${error.message}`, 5000);
                                return;
                            }
                            // Check if the pulled key has "Edit" access
                            if (parsedKeyInfo?.view !== "Edit") {
                                new Notice("This pulled note's key does not have 'Edit' permissions to push changes back to the source.", 5000);
                                return;
                            } 
        
                            const { ip, noteName } = parsedKeyInfo;
                            const file = this.app.vault.getAbstractFileByPath(`${noteName}.md`) as TFile;
        
                            if (!file) {
                                new Notice(`Note "${noteName}" not found in your vault.`, 3000);
                                return;
                            }
        
                            const content = await this.app.vault.read(file);
        
                            console.log("Pushing content from pulled note to source:", ip, noteName);
        
                            const { sendNoteToHost } = await import("../networking/socket/client");
                            sendNoteToHost(ip, noteName, content);
                            new Notice(`Pushed changes for '${noteName}' to original host: ${ip}`, 3000);
                        })
                );
            // --- END MOVED: Push Changes Button ---

            // --- START MOVED: Pull Changes Button ---
            new Setting(this.contentEl)
                .setName('Pull Latest Changes')
                //.setDesc('Retrieve the latest version of this note from the original source.')
                .addButton(button =>
                    button
                        .setButtonText('Pull Changes')
                        .setCta()
                        .onClick(async () => {
                            if (keyItem) {
                                const parsedKeyInfo = parseKey(keyItem.ip); // Ensure parseKey is robust
                                if(parsedKeyInfo?.ip === undefined || parsedKeyInfo?.noteName === undefined) {
                                    new Notice("Invalid key format for pulling. Expected 'IP-NoteName|access type'.", 4000);
                                    return;
                                }
                                // The rewriteExistingNote function already takes the IP and NoteName
                                rewriteExistingNote(this.app, parsedKeyInfo.ip, keyItem.note); 
                                new Notice(`Requested latest changes for "${noteName}".`);
                            } else {
                                new Notice("Could not find key for this pullable note.", 4000);
                            }
                        })
                );
            // --- END MOVED: Pull Changes Button ---

            // Keep the Delete Key & Registry Content here, as it's relevant for pulled notes if you want to unlink them
            new Setting(this.contentEl)
                .setName('Unlink Note') 
                // /.setDesc('Remove this note from your linked notes registry. It will no longer automatically pull updates.') 
                .addButton(button =>
                    button
                        .setButtonText('Unlink Note') 
                        .setWarning()
                        .onClick(async () => {
                            if (keyItem) {
                                const confirmDelete = await new Promise<boolean>(resolve => {
                                    new ConfirmationModal(this.app, `Are you sure you want to unlink "${noteName}"? It will no longer automatically pull updates.`, resolve).open(); 
                                });

                                if (confirmDelete) {
                                    // For pulled notes, you remove them from `linkedKeys`
                                    this.plugin.settings.linkedKeys = this.plugin.settings.linkedKeys.filter(item => item.note !== noteName);
                                    await this.plugin.saveSettings();
                                    new Notice(`Note "${noteName}" unlinked.`, 5000);
                                    // After unlinking, re-render to potentially switch to 'none' panel
                                    this.activeNoteFile = this.app.workspace.getActiveFile();
                                    this.noteType = await this.determineNoteType(this.activeNoteFile);
                                    this.renderPanelContent();
                                } else {
                                    new Notice("Unlinking cancelled.", 2000);
                                }
                            } else {
                                new Notice("Error: Key not found for this pulled note.", 4000);
                            }
                        })
                );
        } else {
            this.contentEl.createEl('p', { text: 'Error: Linked key not found for this pulled note.' });
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
                        this.plugin.activateView(KEY_LIST_VIEW_TYPE);
                    });
            });

        const rightButtons = navButtonContainer.createDiv();
        new Setting(rightButtons)
            .addButton(button => {
                button.setButtonText('Link Note')
                    .onClick(() => {
                        this.plugin.activateView(LINK_NOTE_VIEW_TYPE);
                    });
            });

        navButtonContainer.appendChild(leftButtons);
        navButtonContainer.appendChild(rightButtons);

        // this.contentEl.createEl('p', {
        //     text: 'Use the buttons above to manage existing keys or use the key you have with Link Note.'
        // });
    }

    private renderAutomaticUpdatesSection(): void {
        this.contentEl.createEl('h2', { text: 'Automatic Updates' });
        new Setting(this.contentEl)
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
    }


    getSelectedAccessType(): string | null {
        if (this.accessTypeView.checked) return 'View';
        if (this.accessTypeEdit.checked) return 'Edit';
        if (this.accessTypeViewAndComment.checked) return 'View and Comment';
        if (this.accessTypeEditWithApproval.checked) return 'Edit w/ Approval';
        return null;
    }
}