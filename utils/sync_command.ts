import { Plugin, Notice } from "obsidian";
import type MyPlugin from "../main";

import { syncAllNotesToServer } from "./sync"; // adjust if needed

export function registerSyncAllNotesCommand(plugin: MyPlugin) {
	plugin.addCommand({
		id: "sync-all-notes-to-server",
		name: "Sync All Notes to WebSocket Server",
		callback: async () => {
			const serverUrl = "ws://localhost:3010";
			try {
				await syncAllNotesToServer(plugin as MyPlugin, serverUrl);
				new Notice("All notes synced to server.");
			} catch (err) {
				console.error("[Plugin] Sync failed:", err);
				new Notice("Failed to sync notes.");
			}
		}
	});
}
