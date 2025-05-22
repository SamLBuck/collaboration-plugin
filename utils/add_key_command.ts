// utils/add_key_command.ts

import { App, Modal, Notice } from "obsidian";
import { addKey, generateKey } from "../storage/keyManager"; // Import your keyManager functions
import MyPlugin from "../main"; // Import your main plugin class for type safety

/**
 * Registers the 'Add a Key to Collection' command for the plugin.
 * This command opens a modal to allow the user to manually add or generate a key.
 * @param plugin The instance of your MyPlugin class.
 */
export function registerAddKeyCommand(plugin: MyPlugin) {
    plugin.addCommand({
        id: "add-key",
        name: "Add a Key to Collection",
        callback: () => {
            new AddKeyModal(plugin).open(); // Pass the plugin instance to the modal
        },
    });
}

/**
 * Modal for adding new keys manually or by generating a random one.
 */
class AddKeyModal extends Modal {
    inputEl: HTMLInputElement;
    plugin: MyPlugin; // Store the plugin instance

    constructor(plugin: MyPlugin) {
        super(plugin.app);
        this.plugin = plugin; // Assign the passed plugin instance
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h2", { text: "Add a New Key" });

        this.inputEl = contentEl.createEl("input", {
            type: "text",
            placeholder: "Enter a new key (e.g., obs-collab://ip:port/note/id)",
            cls: "add-key-input" // Optional: for CSS styling
        });

        const buttonContainer = contentEl.createDiv({cls: "button-container"}); // Optional: for button layout

        const addButton = buttonContainer.createEl("button", { text: "Add Key" });
        addButton.onclick = () => this.addKeyToCollection(); // Call instance method

        const randomButton = buttonContainer.createEl("button", { text: "Generate Random Key" });
        randomButton.onclick = () => this.addRandomKey(); // Call instance method

        // Optional: Add a close button
        const closeButton = buttonContainer.createEl("button", { text: "Close" });
        closeButton.onclick = () => this.close();
    }

    onClose() {
        this.contentEl.empty(); // Clear content on close
    }

    /**
     * Handles adding a key entered by the user.
     */
    async addKeyToCollection() {
        const keyName = this.inputEl.value.trim();

        if (!keyName) {
            new Notice("Please enter a key string.", 3000);
            return;
        }

        // Call addKey from keyManager. This function internally saves the settings.
        const success = await addKey(this.plugin, keyName);
        if (success) {
            // Success notice is now handled by addKey
            this.close();
        } else {
            // Failure notice is now handled by addKey for "already exists"
            // You might add other specific failure reasons here if addKey could fail for other reasons.
        }
    }

    /**
     * Handles generating and adding a random key.
     */
    async addRandomKey() {
        // 'defaultNote' and 'admin' are placeholders; customize as needed.
        // generateKey internally calls addKey, which then saves the settings.
        const newKey = await generateKey(this.plugin, "auto-generated-note", "user");
        
        if (newKey) {
            // Success notice is now handled by generateKey -> addKey
            this.close();
        } else {
            // This might happen if generateKey for some reason fails to produce a key,
            // or if addKey fails (e.g., a rare collision of random keys, though unlikely)
            new Notice("Failed to generate and add key.");
        }
    }
}



