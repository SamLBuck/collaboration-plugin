import { App, Notice, FileSystemAdapter, Plugin } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import MyPlugin from "../main";
import { getNoteRegistry } from "main";

/**
 * Launches the WebSocket server subprocess.
 */
export function startWebSocketServerProcess(app: App,plugin:Plugin): void {
	const adapter = app.vault.adapter;
    const noteEntries = getNoteRegistry(plugin).map(entry => [entry.key, entry.content]);
    const sharedNotes = new Map<string, string>(noteEntries);
    
	if (!(adapter instanceof FileSystemAdapter)) {
		new Notice("Vault path not accessible.");
		return;
	}

	const vaultPath = adapter.getBasePath();
	const serverPath = path.join(
		vaultPath,
		".obsidian",
		"plugins",
		"collaboration-plugin",
		"networking",
		"socket",
		"dist",
		"server.cjs"
	);

	if (!fs.existsSync(serverPath)) {
		console.error("[Plugin] server.cjs file not found at:", serverPath);
		new Notice("WebSocket server file not found.");
		return;
	}

	console.log("[Plugin] Launching server at:", serverPath);

	const subprocess = spawn("node", [serverPath], {
		shell: false
	});

	subprocess.stdout.on("data", (data) => {
		console.log("[WS Server]:", data.toString());
	});

	subprocess.stderr.on("data", (err) => {
		console.error("[WS Server Error]:", err.toString());
	});

	subprocess.on("exit", (code) => {
		console.log(`[WS Server] Exited with code ${code}`);
	});

	new Notice("Started WebSocket server.");
}

/**
 * Registers the "Start WebSocket Server" command.
 */
export function registerStartServerCommand(app: App, plugin: MyPlugin): void {
	plugin.addCommand({
		id: "start-websocket-server",
		name: "Start WebSocket Server",
		callback: () => {
			startWebSocketServerProcess(app, plugin);
		}
	});
}
