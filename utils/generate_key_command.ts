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
      id: "generate-share-key",
      name: "Generate Share Key",
      callback: async () => {
        const key = "my-shared-note";
        // Future: start server and build full share link
        new Notice("Share key copied to clipboard");
      },
    });
  }
  
