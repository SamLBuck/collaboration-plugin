import { App, Notice, TFile } from "obsidian";
import MyPlugin from "../main";
import { tempIPInputModal } from "../settings/tempIPInputModal";
import { requestNoteFromPeer } from "../networking/socket/client";

/**
 * Registers the 'Pull Note from Peer (modal)' command.
 * @param app The Obsidian App instance.
 * @param plugin The plugin instance.
 */
export function registerPullNoteCommand(app: App, plugin: MyPlugin) {
    plugin.addCommand({
        id: "pull-note-from-peer-modal",
        name: "Pull Note from Server Registry (enter key and IP)",
        callback: () => {
          //pullNoteFromPeerNewNote(app);  // pullNoteFromPeerNewNote takes a ip nad key 
        },
    });

    plugin.addCommand({
        id: "rewrite-existing-note",
        name: "Rewrite Existing Note (enter key and IP)",
        callback: async () => {
            new tempIPInputModal(app, async (ip: string, key: string) => {
                await rewriteExistingNote(app, ip, key);
            }).open();
        },
    });

    plugin.addCommand({
        id: "overwrite-current-note",
        name: "Overwrite Current Note (enter key and IP)",
        callback: async () => {
            new tempIPInputModal(app, async (ip: string, key: string) => {
                await overwriteCurrentNote(app, ip, key);
            }).open();
        },
    });
}
export async function pullNoteFromPeerNewNote(app: App, ip: string, key: string) {
      try {
        const content = await requestNoteFromPeer(`ws://${ip}:3010`, key);
        await app.vault.create(`${key}.md`, content);
        new Notice(`Note '${key}' pulled and created.`);
      } catch (err) {
        console.error("Failed to pull note:", err);
        new Notice(`Failed to pull note: ${err}`);
      }
  }

  export async function rewriteExistingNote(app: App, ip: string, key: string) {
    try {
        const content = await requestNoteFromPeer(`ws://${ip}:3010`, key);
        const existingFile = app.vault.getAbstractFileByPath(`${key}.md`);
        
        if (existingFile && existingFile instanceof TFile) {
            await app.vault.modify(existingFile, content);
            new Notice(`Note '${key}' pulled and rewritten.`);
        } else {
            new Notice(`Note '${key}' does not exist or is not a file. Cannot rewrite.`);
        }
    } catch (err) {
        console.error("Failed to rewrite note:", err);
        new Notice(`Failed to rewrite note: ${err}`);
    }
}

export async function overwriteCurrentNote(app: App, ip: string, key: string) {
    try {
        const content = await requestNoteFromPeer(`ws://${ip}:3010`, key);
        const activeFile = app.workspace.getActiveFile();

        if (activeFile) {
            await app.vault.modify(activeFile, content);
            new Notice(`Current note overwritten with content from '${key}'.`);
        } else {
            new Notice("No active note to overwrite.");
        }
    } catch (err) {
        console.error("Failed to overwrite current note:", err);
        new Notice(`Failed to overwrite current note: ${err}`);
    }
}

