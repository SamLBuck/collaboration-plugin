import { Plugin, Notice } from "obsidian";
import MyPlugin, { updateNoteRegistry } from "../main";

import { syncAllNotesToServer } from "./sync"; // adjust if needed
import { requestNoteFromPeer } from "../networking/socket/client";

export async function syncRegistryFromServer(plugin: MyPlugin, serverUrl: string) {
    const socket = new WebSocket(serverUrl);

    socket.onopen = () => {
        socket.send(JSON.stringify({ type: "list-keys" }));
    };

    socket.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data.toString());

            if (message.type === "key-list") {
                const keys: string[] = message.payload.keys;
                console.log("[Sync] Keys found on server:", keys);

                for (const key of keys) {
                    const content = await requestNoteFromPeer(serverUrl, key);
                    await updateNoteRegistry(plugin, key, content);
                }

                // Save settings after syncing
                await plugin.saveSettings();
                console.log("[Sync] Registry saved to persistent storage.");

                new Notice(`Pulled and saved ${keys.length} notes from server.`);
                socket.close();
            } else {
                new Notice("Unexpected response during sync.");
            }
        } catch (err) {
            console.error("Error syncing from server:", err);
            new Notice("Failed to sync from server.");
        }
    };
    socket.onerror = (err) => {
        console.error("Connection error during sync:", err);
        new Notice("WebSocket connection failed.");
    };
}

export function registerSyncFromServerToSettings(plugin: Plugin) {
    plugin.addCommand({
        id: "sync-from-server-to-settings",
        name: "Sync Note Registry From Server",
        callback: async () => {
            const url = "ws://localhost:3010";
            await syncRegistryFromServer(plugin as MyPlugin, url);
        }
    });
}


