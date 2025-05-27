import { Plugin, Notice } from "obsidian";
import { App } from "obsidian";
import { registerNoteWithPeer } from "../networking/socket/client";

export async function shareCurrentNote(app: App): Promise<void> {
	const file = app.workspace.getActiveFile();
	if (!file) {
		new Notice("No active file.");
		return;
	}

	const content = await app.vault.read(file);
	const key = file.basename;

	registerNoteWithPeer("ws://localhost:3010", key, content);
	new Notice(`Note '${key}' sent to peer for sharing.`);

}
export function registerShareCurrentNoteCommand(plugin: Plugin) {
	plugin.addCommand({
		id: "share-current-note",
		name: "Register Active Note",
		callback: () => {
			shareCurrentNote(plugin.app);
		}
	});
}
