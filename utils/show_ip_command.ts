import { App, Notice } from "obsidian";
import MyPlugin from "../main";
import { getLocalIP } from "../utils/get-ip";

/**
 * Copies the local IP address to the clipboard and notifies the user.
 */
export async function copyLocalIPToClipboard(): Promise<void> {
	const ip = getLocalIP();
	await navigator.clipboard.writeText(ip);
	console.log("Copied Local IP Address to clipboard:", ip);
	new Notice("Copied Local IP Address to clipboard: " + ip);
}

/**
 * Registers the command to copy and show local IP.
 */
export function registerShowIPCommand(app: App, plugin: MyPlugin): void {
	plugin.addCommand({
		id: "show-local-ip",
		name: "Show This Computer's Local IP",
		callback: async () => {
			await copyLocalIPToClipboard();
		}
	});
}
