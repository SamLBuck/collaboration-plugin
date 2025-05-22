import { App } from "obsidian";
import MyPlugin from "../main"; // Adjust path if needed

export async function addKey(plugin: MyPlugin, newKey: string): Promise<boolean> {
	const existing = plugin.settings.keys.find((k) => k.keys === newKey);
	if (existing) return false;

	plugin.settings.keys.push({ keys: newKey });
	await plugin.saveSettings(); // Persist changes
	return true;
}

export function generateRandomString(length: number): string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let result = "";
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

export async function generateKey(plugin: MyPlugin, noteName: string, role: string): Promise<string> {
	const key = `obs-collab://192.168.1.42:3010/note/${generateRandomString(8)}`;
	await addKey(plugin, key); // Add and save automatically
	return key;
}

export async function deleteKey(plugin: MyPlugin, keyToDelete: string): Promise<boolean> {
	const originalLength = plugin.settings.keys.length;
	plugin.settings.keys = plugin.settings.keys.filter((k) => k.keys !== keyToDelete);

	if (plugin.settings.keys.length === originalLength) return false;

	await plugin.saveSettings(); // Persist after deleting
	return true;
}

export function listKeys(plugin: MyPlugin): string[] {
    return plugin.settings.keys.map((keyObj) => keyObj.keys);
}
