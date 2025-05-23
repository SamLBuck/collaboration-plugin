// utils/add_key_command.ts

import { App, Modal, Notice } from "obsidian";
import { addKey, generateKey } from "../storage/keyManager";
import MyPlugin, { KeyItem } from "../main"; // *** NEW: Import KeyItem from main.ts ***

export function registerAddKeyCommand(plugin: MyPlugin) {
    plugin.addCommand({
        id: "add-key",
        name: "Add a Key to Collection",
        callback: () => {
            new AddKeyModal(plugin).open();
        },
    });
}

class AddKeyModal extends Modal {
    inputEl: HTMLInputElement;
    noteInputEl: HTMLInputElement; // NEW: Input for note name
    accessSelectEl: HTMLSelectElement; // NEW: Select for access type
    plugin: MyPlugin;

    constructor(plugin: MyPlugin) {
        super(plugin.app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h2", { text: "Add a New Key" });

        // Input for the key ID itself
        contentEl.createEl("h3", { text: "Key ID" });
        this.inputEl = contentEl.createEl("input", {
            type: "text",
            placeholder: "Enter key ID (e.g., obs-collab://...)",
            cls: "add-key-input"
        });

        // Input for the associated note name
        contentEl.createEl("h3", { text: "Note Name" });
        this.noteInputEl = contentEl.createEl("input", {
            type: "text",
            placeholder: "Enter associated note name",
            cls: "add-key-note-input"
        });
        // Suggest current note
        this.noteInputEl.value = this.plugin.app.workspace.getActiveFile()?.basename || '';


        // Select for access type
        contentEl.createEl("h3", { text: "Access Type" });
        this.accessSelectEl = contentEl.createEl("select", { cls: "add-key-access-select" });
        const accessTypes = ["View", "Edit", "View and Comment", "Edit w/ Approval"];
        accessTypes.forEach(type => {
            const option = this.accessSelectEl.createEl("option", { text: type });
            option.value = type;
        });
        this.accessSelectEl.value = "Edit"; // Default selection


        const buttonContainer = contentEl.createDiv({cls: "button-container"});

        const addButton = buttonContainer.createEl("button", { text: "Add Manually Entered Key" });
        addButton.onclick = () => this.addKeyToCollection();

        const randomButton = buttonContainer.createEl("button", { text: "Generate & Add Random Key" });
        randomButton.onclick = () => this.addRandomKey();

        const closeButton = buttonContainer.createEl("button", { text: "Close" });
        closeButton.onclick = () => this.close();
    }

    onClose() {
        this.contentEl.empty();
    }

    async addKeyToCollection() {
        const keyId = this.inputEl.value.trim();
        const noteName = this.noteInputEl.value.trim();
        const accessType = this.accessSelectEl.value;

        if (!keyId || !noteName || !accessType) {
            new Notice("Please fill in all fields (Key ID, Note Name, Access Type).", 3000);
            return;
        }

        const newKeyItem: KeyItem = { id: keyId, note: noteName, access: accessType };
        await addKey(this.plugin, newKeyItem);
        this.close();
    }

    async addRandomKey() {
        const noteName = this.noteInputEl.value.trim() || "Generated Note"; // Use note input or a default
        const accessType = this.accessSelectEl.value;

        // generateKey now returns a KeyItem
        const newKeyItem = await generateKey(this.plugin, noteName, accessType);

        // Then, use addKey to actually add and save it
        await addKey(this.plugin, newKeyItem);

        this.close();
    }
}