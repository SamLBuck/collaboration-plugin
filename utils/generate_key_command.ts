import { App, Plugin, Notice } from "obsidian";
import { generateKey } from "../storage/keyManager";

export function registerGenerateKeyCommand(app: App, plugin: Plugin) {
  plugin.addCommand({
    id: "generate-access-key",
    name: "Generate Access Key",
    callback: async () => {
      const noteId = "test-note";
      const accessType = "view";

      const key = await generateKey(this.plugin, noteId, accessType); // Pass plugin to generateKey

      if (key) {
        new Notice(`Key created: ${key}`);
      } else {
        new Notice(`Key not created. It might already exist or be missing info.`);
      }
    },
  });
}


