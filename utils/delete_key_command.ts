// utils/delete_key_command.ts
import { App, Modal, Notice, Plugin } from "obsidian";
import { deleteKey, listKeys } from "../storage/keyManager";
import MyPlugin, { KeyItem } from "../main"; // *** NEW: Import KeyItem from main.ts ***

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
        const keys = await listKeys(this.plugin); // listKeys now returns KeyItem[]

        contentEl.createEl("h2", { text: "Delete a Key" });

        if (keys.length === 0) {
            contentEl.createEl("p", { text: "No keys to delete." });
            return;
        }

        const listContainer = contentEl.createEl("div");

        keys.forEach((keyItem: KeyItem) => { // Iterate over KeyItem objects
            const button = listContainer.createEl("button", { text: `Delete "${keyItem.ip}" (Note: ${keyItem.note}, Access: ${keyItem.access})` });
            button.onclick = async () => {
                // Pass the ID of the key item to delete
                const success = await deleteKey(this.plugin, keyItem.ip);
                if (success !== undefined) { // Ensure success is not void
                    new Notice(`Key "${keyItem.ip}" deleted successfully.`);
                } else {
                    new Notice(`Failed to delete "${keyItem.ip}".`);
                }
                this.close(); // Close after deletion
            };
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}