// utils/generate_key_command.ts

import { App, Notice } from "obsidian";
import { generateKey } from "../storage/keyManager"; // Import your keyManager functions
import MyPlugin from "../main"; // Import your main plugin class for type safety

/**
 * Registers the 'Generate Access Key' command for the plugin.
 * This command will generate a new key and add it to the plugin's stored keys.
 * @param app The Obsidian App instance.
 * @param plugin The instance of your MyPlugin class.
 */
export function registerGenerateKeyCommand(app: App, plugin: MyPlugin) {
    plugin.addCommand({
        id: "generate-access-key",
        name: "Generate Access Key",
        callback: async () => {
            // These can be dynamic based on the active note, user input, etc.
            // For now, they are placeholders.
            const noteId = "test-note"; // You might want to get the active note's title/path here
            const accessType = "view"; // Or "edit", "full", etc.

            // Call generateKey from keyManager. This function internally calls addKey,
            // which then saves the settings.
            const key = await generateKey(plugin, noteId, accessType);

            if (key) {
                new Notice(`Generated and Added: ${key}`, 5000); // Display the generated key
                // No need to call plugin.saveSettings() here, as generateKey -> addKey already does it.
            } else {
                // This else block might be hit if generateKey itself has an issue (though currently it doesn't).
                // Or if addKey within generateKey returns false (e.g., key already exists, though generateKey tries to be unique)
                new Notice(`Key not generated or added. It might already exist or be missing info.`);
            }
        },
    });
}

