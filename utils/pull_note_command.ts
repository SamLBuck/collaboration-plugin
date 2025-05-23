import { App, Notice } from "obsidian";
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
          pullNoteFromPeerWithModal(app);
        },
      });
    }
export async function pullNoteFromPeerWithModal(app: App) {
    new tempIPInputModal(app, async (ip: string, key: string) => {
      try {
        const content = await requestNoteFromPeer(`ws://${ip}:3010`, key);
        await app.vault.create(`${key}.md`, content);
        new Notice(`Note '${key}' pulled and created.`);
      } catch (err) {
        console.error("Failed to pull note:", err);
        new Notice(`Failed to pull note: ${err}`);
      }
    }).open();
  }
  
