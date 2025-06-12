import { App, Notice, FileSystemAdapter, Plugin } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import MyPlugin from "../main";
// import { getNoteRegistry } from "../storage/registryStore"; // Not used here, good to keep imports lean if not needed
import { syncAllNotesToServer } from "../utils/sync"; // Keep if used in setTimeout

import * as net from "net";

// Function to check if a port is available
function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const tester = net.createServer()
            .once('error', (err: any) => { // Using 'any' for err for flexibility with 'code' property
                if (err.code === 'EADDRINUSE') {
                    resolve(false); // Port is in use
                } else {
                    console.error("[Plugin] Port availability check error:", err);
                    resolve(false); // Other error, assume not available for safety
                }
            })
            .once('listening', function () {
                tester.close(); // Close the server to release the port
                resolve(true); // Port is available
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
        new Notice("WebSocket server file not found. Please ensure 'server.cjs' is in the 'dist' folder.");
        return;
    }

    // 🔪 Kill any old PID first for a clean restart
    if (fs.existsSync(pidPath)) {
        const pid = parseInt(fs.readFileSync(pidPath, "utf8"));
        if (!isNaN(pid)) {
            try {
                process.kill(pid);
                console.log(`[Plugin] Killed stale WebSocket server with PID ${pid}`);
            } catch (err) {
                console.warn(`[Plugin] Could not kill PID ${pid} (it may have already stopped or permissions issue).`);
            }
        }
        fs.unlinkSync(pidPath); // Always remove the PID file if it exists
    }

    const PORT = 3010;
    isPortAvailable(PORT).then((available) => {
        console.log(`[Plugin] Attempting to launch WebSocket server from: ${serverPath}`);
        const subprocess = spawn("node", [serverPath], {
            shell: false, // Prevents shell interpolation issues
            detached: true, // Allows the child process to run independently
            stdio: 'inherit' 
        });

        // Save the new PID
        fs.writeFileSync(pidPath, String(subprocess.pid));

        // // Optional: These listeners are generally not needed when stdio: 'inherit' is used
        // subprocess.stdout.on("data", (data) => {
        //     console.log("[WS Server stdout]:", data.toString());
        // });
        // subprocess.stderr.on("data", (err) => {
        //     console.error("[WS Server stderr]:", err.toString());
        // });

        subprocess.on("exit", (code, signal) => {
            console.log(`[Plugin] WebSocket server process exited with code ${code} and signal ${signal}`);
            // Clean up PID file on exit
            if (fs.existsSync(pidPath)) {
                fs.unlinkSync(pidPath);
            }
            if (code !== 0) {
                new Notice(`WebSocket server exited unexpectedly with code ${code}. Check console for details.`);
            }
        });

        subprocess.on('error', (err) => {
            console.error(`[Plugin] Failed to launch WebSocket server process (spawn error): ${err.message}`);
            new Notice(`Failed to launch WebSocket server: ${err.message}. Check console for details.`);
        });

        console.log(`[Plugin] WebSocket server process launched with PID ${subprocess.pid}. Checking for server's own logs.`);
        new Notice(`WebSocket server launched (PID: ${subprocess.pid}) at ws://localhost:${PORT}`);

        // Sync after a short delay (ensure syncAllNotesToServer exists and is imported)
        // Only run if you intend for automatic sync on server start
        setTimeout(() => {
            syncAllNotesToServer(plugin, `ws://localhost:${PORT}`)
                .then(() => console.log("[Plugin] Synced all notes to WebSocket server"))
                .catch(err => console.error("[Plugin] Sync failed:", err));
        }, 1000);
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