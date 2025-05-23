import { App, Notice } from "obsidian";
import { Plugin } from "obsidian";


export async function listSharedNoteKeys(app: App, ip: string = "localhost"): Promise<void> {
	const socket = new WebSocket(`ws://${ip}:3010`);

	socket.onopen = () => {
		socket.send(JSON.stringify({ type: "list-keys" }));
	};

	socket.onmessage = (event) => {
		try {
			const message = JSON.parse(event.data.toString());

			if (message.type === "key-list") {
				const keys = message.payload.keys;
				console.log("[Plugin] Keys in peer registry:", keys);

				navigator.clipboard.writeText(keys.join(", "));
				new Notice("Copied keys to clipboard: " + keys.join(", "));

				socket.close();
			} else {
				new Notice("Unexpected response type");
			}
		} catch (err) {
			console.error("Failed to parse response:", err);
			new Notice("Error reading response from server.");
		}
	};

	socket.onerror = (err) => {
		console.error("Failed to connect to peer:", err);
		new Notice("Connection error.");
	};
}
export function registerListSharedKeysCommand(plugin: Plugin) {
	plugin.addCommand({
		id: "list-shared-note-keys",
		name: "List Shared Note Keys from server registry",
		callback: () => {
			listSharedNoteKeys(plugin.app);
		}
	});
}
