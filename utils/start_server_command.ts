import { App, Notice, FileSystemAdapter, Plugin } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import MyPlugin from "../main";
// import { getNoteRegistry } from "../storage/registryStore"; // Not used here, good to keep imports lean if not needed
import { syncAllNotesToServer } from "../utils/sync"; // Keep if used in setTimeout

import * as net from "net";
import { start } from "repl";

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

import { exec } from "child_process"; // Ensure this is imported

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

    const PORT = 3010;

    const killPort = (port: number): Promise<void> => {
        return new Promise((resolve) => {
            if (process.platform === "win32") {
                // Windows: use netstat + taskkill
                exec(`for /f "tokens=5" %a in ('netstat -aon ^| find ":${port} "') do taskkill /F /PID %a`, (err) => {
                    if (err) console.warn(`[Plugin] Could not kill process on port ${port} (likely already free).`);
                    resolve();
                });
            } else {
                // Unix/macOS: use lsof + kill
                exec(`lsof -t -i:${port} | xargs kill -9`, (err) => {
                    if (err) console.warn(`[Plugin] Could not kill process on port ${port} (likely already free).`);
                    resolve();
                });
            }
        });
    };

    const start = async () => {
        // Try to kill previous PID
        if (fs.existsSync(pidPath)) {
            const pid = parseInt(fs.readFileSync(pidPath, "utf8"));
            if (!isNaN(pid)) {
                try {
                    process.kill(pid);
                    console.log(`[Plugin] Killed stale WebSocket server with PID ${pid}`);
                } catch (err) {
                    console.warn(`[Plugin] Could not kill PID ${pid} (may already be stopped or inaccessible).`);
                }
            }
            fs.unlinkSync(pidPath);
        }

        // Free the port regardless of PID
        await killPort(PORT);

        console.log(`[Plugin] Attempting to launch WebSocket server from: ${serverPath}`);
        const subprocess = spawn("node", [serverPath], {
            shell: false,
            detached: true,
            stdio: 'inherit'
        });
        subprocess.unref();
        fs.writeFileSync(pidPath, String(subprocess.pid));

        subprocess.on("exit", (code, signal) => {
            console.log(`[Plugin] WebSocket server process exited with code ${code} and signal ${signal}`);
            if (fs.existsSync(pidPath)) {
                fs.unlinkSync(pidPath);
            }
            if (code !== 0) {
                new Notice(`WebSocket server exited unexpectedly with code ${code}.`);
            }
        });

        subprocess.on('error', (err) => {
            console.error(`[Plugin] Failed to launch WebSocket server process: ${err.message}`);
            new Notice(`Failed to launch WebSocket server: ${err.message}`);
        });

        console.log(`[Plugin] WebSocket server launched with PID ${subprocess.pid} at ws://localhost:${PORT}`);
        new Notice(`WebSocket server launched (PID: ${subprocess.pid}) at ws://localhost:${PORT}`);

        setTimeout(() => {
            syncAllNotesToServer(plugin, `ws://localhost:${PORT}`)
                .then(() => console.log("[Plugin] Synced all notes to WebSocket server"))
                .catch(err => console.error("[Plugin] Sync failed:", err));
        }, 1000);
    };

    start();
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
let attempts = 0
async function startServerAgain(app: App, plugin: MyPlugin): Promise<void> {
    attempts++;
    if(attempts < 10){
    await startWebSocketServerProcess(app, plugin);
    }
}
