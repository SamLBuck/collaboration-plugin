import { App, Modal, Notice, Plugin } from "obsidian";
import { deleteKey, listKeys } from "../storage/keyManager";
import MyPlugin from "../main"; // Import MyPlugin

export function registerDeleteKeyCommand(plugin: MyPlugin) {  // Use MyPlugin here
  plugin.addCommand({
    id: "delete-key",
    name: "Delete a Stored Key",
    callback: () => {
      new DeleteKeyModal(plugin).open();  // Pass MyPlugin here
    },
  });
}

class DeleteKeyModal extends Modal {
  plugin: MyPlugin;  // Use MyPlugin here

  constructor(plugin: MyPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  async onOpen() {
    const { contentEl } = this;
    const keys = await listKeys(this.plugin); // Use MyPlugin to list keys

    contentEl.createEl("h2", { text: "Delete a Key" });

    if (keys.length === 0) {
      contentEl.createEl("p", { text: "No keys to delete." });
      return;
    }

    const listContainer = contentEl.createEl("div");

    keys.forEach((key: string) => {
      const button = listContainer.createEl("button", { text: `Delete "${key}"` });
      button.onclick = async () => {
        const success = await deleteKey(this.plugin, key); // Pass MyPlugin to deleteKey
        if (success) {
          new Notice(`Key "${key}" deleted successfully.`);
        } else {
          new Notice(`Failed to delete "${key}".`);
        }
        this.close();
      };
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}



