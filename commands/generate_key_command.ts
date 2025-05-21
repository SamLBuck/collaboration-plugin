// commands/generateKeyCommand.ts

import { App, Plugin, Notice } from "obsidian";
import { generateKey } from "../storage/keyManager";

/**
 * Adds a command to the Obsidian command palette to generate a new key.
 * This version uses both `app` and `plugin` parameters for full flexibility.
 *
 * @param app - The main Obsidian app object
 * @param plugin - Your plugin instance 
 */
export function registerGenerateKeyCommand(app: App, plugin: Plugin) {
plugin.addCommand({
    id: "generate-access-key",            // Internal ID for the command
    name: "Generate Access Key",          // Name shown in the command palette
    callback: () => {
      const noteId = "test-note";         // Replace with your actual note ID
      const accessType = "view";

       const key = generateKey(noteId, accessType);

      if (key) {
        new Notice(`Key created: ${key}`);
      } else {
        new Notice(`Key not created. It might already exist or be missing info.`);
      }
    }
  });
}
