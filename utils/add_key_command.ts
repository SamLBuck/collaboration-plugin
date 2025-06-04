// utils/add_key_command.ts

import { App, Modal, Notice, ButtonComponent } from "obsidian"; // Ensure ButtonComponent is imported
import { addKey, generateKey } from "../storage/keyManager";
import MyPlugin, { KeyItem } from "../main";
import { generateMACKey } from "./generateMACKey";

export function registerAddKeyCommand(plugin: MyPlugin) {
    plugin.addCommand({
        id: "add-key",
        name: "Generate & Add a Key (IP-NoteName)",
        callback: () => {
            new AddKeyModal(plugin).open();
        },
    });
}

class AddKeyModal extends Modal {
    noteInputEl: HTMLInputElement;
    accessSelectEl: HTMLSelectElement;
    plugin: MyPlugin;

    constructor(plugin: MyPlugin) {
        super(plugin.app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h2", { text: "Generate & Add New Key" });

        // Input for the associated note name
        contentEl.createEl("h3", { text: "Note Name" });
        this.noteInputEl = contentEl.createEl("input", {
            type: "text",
            placeholder: "Enter associated note name",
            cls: "add-key-note-input"
        });
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

        // CORRECTED: Use ButtonComponent for the generate button
        new ButtonComponent(buttonContainer) // Create a new ButtonComponent instance
            .setButtonText("Generate & Save Key")
            .setCta() // This method now exists on ButtonComponent
            .onClick(() => this.generateAndSaveKey()); // Attach the click handler

        // CORRECTED: Use ButtonComponent for the close button as well for consistency
        new ButtonComponent(buttonContainer)
            .setButtonText("Close")
            .onClick(() => this.close()); // Attach the click handler
    }

    onClose() {
        this.contentEl.empty();
    }

    async generateAndSaveKey() {
        const noteName = this.noteInputEl.value.trim();
        const accessType = this.accessSelectEl.value;

        if (!noteName) {
            new Notice("Please provide a Note Name to generate a key.", 4000);
            return;
        }

        const existingKey = this.plugin.settings.keys.find(
            key => key.note === noteName && key.access === accessType
        );
        if (existingKey) {
            new Notice(`A key for "${noteName}" with "${accessType}" access already exists. Cannot generate a duplicate. Existing Key: ${existingKey.ip}`, 8000);
            return;
        }

        try {
            //const newKeyItem = await generateKey(this.plugin, noteName, accessType);
            const newKeyItem = await generateMACKey(this.plugin, noteName, accessType);

            //const success = await addKey(this.plugin, newKeyItem);
            const success = await addKey(this.plugin, newKeyItem);

            if (success) {
                new Notice(`Generated & Saved: ${newKeyItem.ip}\nFor Note: "${newKeyItem.note}" (Access: ${newKeyItem.access})`, 8000);
                await navigator.clipboard.writeText(newKeyItem.ip);
                this.close();
            } else {
                new Notice("Failed to add generated key. It might already exist (password collision).", 4000);
            }
        } catch (error: any) {
            console.error("Error generating or adding key:", error);
            new Notice(`Error generating key: ${error.message}`, 5000);
        }
    }
}
