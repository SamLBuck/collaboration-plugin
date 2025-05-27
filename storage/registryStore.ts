import type MyPlugin from "../main";
import { syncAllNotesToServer } from "../utils/sync";

export interface NoteRegistryItem {
	key: string;
	content: string;
}

export function getNoteRegistry(plugin: MyPlugin): NoteRegistryItem[] {
	return plugin.settings?.registry ?? [];
}

export async function updateNoteRegistry(plugin: MyPlugin, key: string, content: string) {
	const registry = getNoteRegistry(plugin);
	const existing = registry.find(item => item.key === key);

	if (existing) {
		existing.content = content;
	} else {
		registry.push({ key, content });
	}

	plugin.settings.registry = registry;
	await plugin.saveSettings();
    try {
        const serverUrl = "ws://localhost:3010"; // Replace with your server URL
        await syncAllNotesToServer(plugin, serverUrl);
        console.log("[RegistryStore] Notes synced to server after update.");
    } catch (err) {
        console.error("[RegistryStore] Failed to sync notes after update:", err);
    }

}

export async function deleteNoteFromRegistry(plugin: MyPlugin, key: string) {
	const registry = getNoteRegistry(plugin).filter(item => item.key !== key);
	plugin.settings.registry = registry;
	await plugin.saveSettings();
    try {
        const serverUrl = "ws://localhost:3010"; // Replace with your server URL
        await syncAllNotesToServer(plugin, serverUrl);
        console.log("[RegistryStore] Notes synced to server after deletion.");
    } catch (err) {
        console.error("[RegistryStore] Failed to sync notes after deletion:", err);
    }

}
