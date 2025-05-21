// add_key_command.ts

import { App, Modal, Notice, Plugin } from "obsidian";
import { addKey, generateKey } from "../storage/keyManager";

export function registerAddKeyCommand(plugin: Plugin) {
  plugin.addCommand({
    id: "add-key",
    name: "Add a Key to Collection",
    callback: () => {
      new AddKeyModal(plugin.app).open();
    },
  });
}

class AddKeyModal extends Modal {
  inputEl: HTMLInputElement;

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h2", { text: "Add a New Key" });

    // Create an input field to manually enter a key
    this.inputEl = contentEl.createEl("input", {
      type: "text",
      placeholder: "Enter a new key name (or leave blank for random)",
    });

    const addButton = contentEl.createEl("button", { text: "Add Key" });
    addButton.onclick = () => this.addKeyToCollection();

    const randomButton = contentEl.createEl("button", { text: "Generate Random Key" });
    randomButton.onclick = () => this.addRandomKey();
  }

  onClose() {
    this.contentEl.empty();
  }

  async addKeyToCollection() {
    const keyName = this.inputEl.value.trim();

    if (!keyName) {
      new Notice("Please enter a key name.");
      return;
    }

    const success = addKey(keyName);
    if (success) {
      new Notice(`Key "${keyName}" added successfully.`);
      this.close();
    } else {
      new Notice(`Key "${keyName}" already exists.`);
    }
  }

  async addRandomKey() {
    // Using default 'noteId' and 'accessType' for random key generation
    const newKey = generateKey("defaultNote", "admin");
    const success = addKey(newKey);
    if (success) {
      new Notice(`Random Key "${newKey}" added successfully.`);
      this.close();
    } else {
      new Notice("Failed to generate and add key.");
    }
  }
}
