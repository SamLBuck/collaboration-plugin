import { getNoteRegistry } from "../storage/registryStore";
import type MyPlugin from "../main";
import { registerNoteWithPeer } from '../networking/socket/client';


/**
 * Sends all notes in plugin.settings.registry to the live WebSocket server.
 */
export async function syncAllNotesToServer(plugin: MyPlugin, serverUrl: string): Promise<void> {
	const registry = getNoteRegistry(plugin);

	for (const entry of registry) {
		console.log(entry.content);
		console.log(`[Sync] Registering note '${entry.key}' with server at ${serverUrl}`);
		registerNoteWithPeer(serverUrl, entry.key, entry.content);
	}
}
