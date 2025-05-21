// delete_key_command.ts

import { App, Modal, Notice, Plugin } from "obsidian";
import { deleteKey, listKeys } from "../storage/keyManager";

export function registerDeleteKeyCommand(plugin: Plugin) {
  plugin.addCommand({
    id: "delete-key",
    name: "Delete a Stored Key",
    callback: () => {
      new DeleteKeyModal(plugin.app).open();
    },
  });
}

class DeleteKeyModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    const keys = listKeys();

    contentEl.createEl("h2", { text: "Delete a Key" });

    if (keys.length === 0) {
      contentEl.createEl("p", { text: "No keys to delete." });
      return;
    }

    const listContainer = contentEl.createEl("div");

    keys.forEach((key) => {
      const button = listContainer.createEl("button", { text: `Delete "${key}"` });
      button.onclick = () => {
        const success = deleteKey(key);
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

