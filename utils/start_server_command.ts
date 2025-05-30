import { App, Notice, FileSystemAdapter, Plugin } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import MyPlugin from "../main";
import { getNoteRegistry } from "../storage/registryStore";
import { syncAllNotesToServer } from "../utils/sync";


import * as net from "net";

function isPortAvailable(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const tester = net.createServer()
			.once('error', () => resolve(false))
			.once('listening', function () {
				tester.close();
				resolve(true);
			})
			.listen(port);
	});
}
export function startWebSocketServerProcess(app: App, plugin: MyPlugin): void {
	const adapter = app.vault.adapter;
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

	const pidPath = path.join(
		vaultPath,
		".obsidian",
		"plugins",
		"collaboration-plugin",
		"ws-server.pid"
	);

	if (!fs.existsSync(serverPath)) {
		console.error("[Plugin] server.cjs file not found at:", serverPath);
		new Notice("WebSocket server file not found.");
		return;
	}

	if (fs.existsSync(pidPath)) {
		const pid = parseInt(fs.readFileSync(pidPath, "utf8"));
		if (!isNaN(pid)) {
			try {
				process.kill(pid);
				console.log(`[Plugin] Killed stale WebSocket server with PID ${pid}`);
			} catch (err) {
				console.warn(`[Plugin] Could not kill PID ${pid} (may already be gone).`);
			}
		}
		fs.unlinkSync(pidPath);
	}

	const PORT = 3010;
	isPortAvailable(PORT).then((available) => {
		if (!available) {
			console.warn(`[Plugin] Port ${PORT} is already in use. Skipping server start.`);
			new Notice(`WebSocket server already running on port ${PORT}., try using the command Start WebSocket Server!`);

			return;
		}

		console.log("[Plugin] Launching server at:", serverPath);
		const subprocess = spawn("node", [serverPath], {
			shell: false,
			detached: true
		});

		//Save the new PID
		fs.writeFileSync(pidPath, String(subprocess.pid));

		// Sync after a short delay
		setTimeout(() => {
			syncAllNotesToServer(plugin, `ws://localhost:${PORT}`)
				.then(() => console.log("[Plugin] Synced all notes to WebSocket server"))
				.catch(err => console.error("[Plugin] Sync failed:", err));
		}, 1000);

		// Optional: capture output
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
	});
}
export function registerStartServerCommand(app: App, plugin: MyPlugin): void {
	plugin.addCommand({
		id: "start-websocket-server",
		name: "Start WebSocket Server",
		callback: () => {
			startWebSocketServerProcess(app, plugin);
		}
	});
}
