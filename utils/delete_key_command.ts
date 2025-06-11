// utils/delete_key_command.ts

import { App, Modal, Notice, Plugin, ButtonComponent, Setting } from "obsidian";
import { deleteSpecificKey } from "../storage/keyManager"; 
import MyPlugin, { KeyItem } from "../main"; 

// --- INLINED: ConfirmationModal class definition ---
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

// --- REMOVED: import { tempKeyInputModal } from "src/settings/tempKeyInputModal"; as it was unused and caused errors ---

export function registerDeleteKeyCommand(plugin: MyPlugin) { 
    plugin.addCommand({
        id: "delete-key",
        name: "Delete a Stored Key",
        callback: () => {
            new DeleteKeyModal(plugin).open();
        },
    });
}

class DeleteKeyModal extends Modal {
    plugin: MyPlugin;

    constructor(plugin: MyPlugin) {
        super(plugin.app);
        this.plugin = plugin;
    }

    async onOpen() {
        const { contentEl } = this;
        const keys = this.plugin.settings.keys; 

        contentEl.createEl("h2", { text: "Delete a Key" });

        if (keys.length === 0) {
            contentEl.createEl("p", { text: "No keys to delete." });
            return;
        }

        const listContainer = contentEl.createEl("div");

        keys.forEach((keyItem: KeyItem) => {
            const listItem = listContainer.createDiv({ cls: 'key-modal-list-item' });
            listItem.createEl("span", { text: `"${keyItem.ip}" (Note: ${keyItem.note}, Access: ${keyItem.access})` });

            const deleteButton = new ButtonComponent(listItem)
                .setButtonText("Delete")
                .setClass("mod-warning")
                .onClick(async () => {
                    const confirmDelete = await new Promise<boolean>(resolve => {
                        new ConfirmationModal(
                            this.app,
                            `Are you sure you want to delete the key for "${keyItem.note}" (${keyItem.access})?`,
                            resolve
                        ).open();
                    });

                    if (confirmDelete) {
                        const success = await deleteSpecificKey(this.plugin, keyItem.ip);
                        if (success) {
                            new Notice(`Key "${keyItem.ip}" deleted successfully.`);
                            this.close(); 
                        } else {
                            new Notice(`Failed to delete key '${keyItem.ip}'. It might not exist.`);
                        }
                    } else {
                        new Notice(`Deletion of "${keyItem.ip}" cancelled.`);
                    }
                });
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
