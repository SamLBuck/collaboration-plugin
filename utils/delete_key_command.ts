// utils/delete_key_command.ts

import { App, Modal, Notice, Plugin, ButtonComponent } from "obsidian"; // Ensure ButtonComponent is imported
import { deleteKey, listKeys } from "../storage/keyManager";
import MyPlugin, { KeyItem } from "../main";
// Assuming you have a ConfirmationModal available. If not, replace with simple `confirm()`
// import { ConfirmationModal } from './path/to/ConfirmationModal'; 

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
        const keys = await listKeys(this.plugin);

        contentEl.createEl("h2", { text: "Delete a Key" });

        if (keys.length === 0) {
            contentEl.createEl("p", { text: "No keys to delete." });
            return;
        }

        const listContainer = contentEl.createEl("div");

        keys.forEach((keyItem: KeyItem) => {
            const button = listContainer.createEl("button", { text: `Delete "${keyItem.ip}" (Note: ${keyItem.note}, Access: ${keyItem.access})` });
            button.onclick = async () => {
                // IMPORTANT CHANGE HERE: Pass keyItem.ip, which is the unique ID
                // Use a simple confirm if you don't have a custom ConfirmationModal
                const confirmDelete = await new Promise<boolean>(resolve => {
                    const confirmed = confirm(`Are you sure you want to delete the key for "${keyItem.note}" (${keyItem.access})?`);
                    resolve(confirmed);
                });


                if (confirmDelete) {
                    await deleteKey(this.plugin, keyItem.ip); // <<< Pass keyItem.ip here
                    new Notice(`Key "${keyItem.ip}" deleted successfully.`);
                    this.close(); // Close after deletion, or re-render if you want to stay open and show updated list
                    // If you want to re-render the list without closing, you'd call this.onOpen() again
                    // after clearing contentEl, or have a specific re-render method.
                    // For simplicity, closing the modal after action is often fine.
                } else {
                    new Notice(`Deletion of "${keyItem.ip}" cancelled.`);
                }
            };
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}