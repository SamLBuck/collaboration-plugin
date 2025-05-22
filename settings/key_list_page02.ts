// settings/key_list_page02.ts

import { Modal, App, Notice } from "obsidian";
import type MyPlugin from "../main";
import { KeyItem } from "../main"; // Import KeyItem interface
import { SettingsModal } from "./main_page01";
// FIX: Add generateKey to the import list
import { addKey, deleteKey, listKeys, generateKey } from "../storage/keyManager"; // Import keyManager functions

export class KeyListModal extends Modal {
    plugin: MyPlugin;

    // References to input elements for adding a new key
    private newKeyIdInput: HTMLInputElement;
    private newNoteNameInput: HTMLInputElement;
    private newAccessTypeSelect: HTMLSelectElement;

    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Key List" });

        // Get keys directly from plugin's settings (persistent storage)
        const currentKeys = await listKeys(this.plugin);

        if (currentKeys.length === 0) {
            contentEl.createEl("p", { text: "No keys currently stored." });
        } else {
            // List all keys from plugin.settings
            currentKeys.forEach((keyItem: KeyItem) => {
                const row = contentEl.createDiv({ cls: "key-row" });
                row.createSpan({
                    text: `ID: ${keyItem.id} | Note: ${keyItem.note} | Access: ${keyItem.access}`,
                });

                const delBtn = row.createEl("button", { text: "Delete key" });
                delBtn.onclick = async () => {
                    await deleteKey(this.plugin, keyItem.id);
                    this.onOpen(); // Re-render the list after deletion
                };
            });
        }

        // Add key form
        contentEl.createEl("h3", { text: "Add New Key" });
        this.newKeyIdInput = contentEl.createEl("input", { placeholder: "Key ID (leave empty to generate)..." });
        this.newNoteNameInput = contentEl.createEl("input", { placeholder: "Note name..." });
        this.newNoteNameInput.value = this.app.workspace.getActiveFile()?.basename || ''; // Suggest current note

        this.newAccessTypeSelect = contentEl.createEl("select");
        const accessTypes = ["View", "Edit", "View and Comment", "Edit w/ Approval"];
        accessTypes.forEach((type) => {
            const option = this.newAccessTypeSelect.createEl("option", { text: type });
            option.value = type;
        });
        this.newAccessTypeSelect.value = "Edit"; // Default selection

        const addBtn = contentEl.createEl("button", { text: "Add Key" });
        addBtn.onclick = async () => {
            const keyId = this.newKeyIdInput.value.trim();
            const noteName = this.newNoteNameInput.value.trim();
            const accessType = this.newAccessTypeSelect.value;

            if (!keyId && !noteName) {
                new Notice("Please enter a Note name for the new key, or a Key ID.", 3000);
                return;
            }

            if (!accessType) {
                new Notice("Please select an Access Type.", 3000);
                return;
            }

            // FIX: Declare newKeyItem to correctly allow null
            let newKeyItem: KeyItem | null = null; // Initialize to null

            if (keyId) {
                 // Manual add: if key ID is provided, use it
                newKeyItem = { id: keyId, note: noteName || "Manual Note", access: accessType };
            } else {
                // Auto-generate: if key ID is empty, generate one
                // FIX: Call generateAndAddKey helper function directly
                newKeyItem = await this.generateAndAddKey(noteName, accessType);
            }
            
            // FIX: Add check for null before proceeding
            if (newKeyItem) {
                await addKey(this.plugin, newKeyItem);
                this.newKeyIdInput.value = ''; // Clear inputs
                this.newNoteNameInput.value = '';
                this.onOpen(); // Re-render the list to show the new key
            } else {
                // If generateAndAddKey returned null, a notice would have already been shown
                console.warn("Key generation failed, not adding key.");
            }
        };

        // Back button
        const backBtn = contentEl.createEl("button", { text: "⬅ Back" });
        backBtn.onclick = () => {
            this.close();
            new SettingsModal(this.app, this.plugin).open();
        };
    }

    onClose() {
        this.contentEl.empty();
    }

    // Helper to generate and add key for this modal's specific flow
    private async generateAndAddKey(noteName: string, accessType: string): Promise<KeyItem | null> {
        try {
            // FIX: Call generateKey directly from imported function
            const newKeyItem = await generateKey(this.plugin, noteName, accessType);
            return newKeyItem;
        } catch (error) {
            new Notice(`Failed to generate key: ${error.message}`, 4000);
            return null;
        }
    }
}