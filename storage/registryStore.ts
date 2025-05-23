import type MyPlugin from "../main";

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
}

export async function deleteNoteFromRegistry(plugin: MyPlugin, key: string) {
	const registry = getNoteRegistry(plugin).filter(item => item.key !== key);
	plugin.settings.registry = registry;
	await plugin.saveSettings();
}
