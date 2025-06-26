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
    const pluginDir = path.join(vaultPath, ".obsidian", "plugins", "collaboration-plugin");
    const distDir   = path.join(pluginDir, "networking", "socket", "dist");
    const bundlePath = path.join(distDir, "server.bundle.cjs");
    const pidPath    = path.join(pluginDir, "ws-server.pid");
    const PORT       = 3010;
    
    // sanity check
    if (!fs.existsSync(bundlePath)) {
      console.error("[Plugin] server.bundle.cjs not found at:", bundlePath);
      new Notice(
        "WebSocket server bundle not found.\n" +
        "Run `npm run build` then `npm run sync:vault` in your dev repo before reloading."
      );
      return;
    }
    
    const killPort = (port: number): Promise<void> =>
      new Promise((resolve) => {
        const cmd = process.platform === "win32"
          ? `for /f "tokens=5" %a in ('netstat -aon ^| find ":${port} "') do taskkill /F /PID %a`
          : `lsof -t -i:${port} | xargs kill -9`;
        exec(cmd, (err) => {
          if (err) console.warn(`[Plugin] Could not kill process on port ${port}.`);
          resolve();
        });
      });
    
    const start = async () => {
      // kill previous process by PID file
      if (fs.existsSync(pidPath)) {
        const pid = Number(fs.readFileSync(pidPath, "utf8"));
        try {
          process.kill(pid);
          console.log(`[Plugin] Killed stale WebSocket server PID ${pid}`);
        } catch {}
        fs.unlinkSync(pidPath);
      }
    
      // free port
      await killPort(PORT);
    
      console.log(`[Plugin] Launching WebSocket server from: ${bundlePath}`);
// 👍 explicitly invoke the 'node' CLI so your .cjs bundle runs under Node
// inside startWebSocketServerProcess, in your `start` function:

console.log(`[Plugin] Launching WebSocket server from: ${bundlePath}`);

// spawn but pipe stdio so we can see what the server prints or errors
const subprocess = spawn("node", [bundlePath], {
  cwd: distDir,
  detached: false,
  stdio: ["ignore", "pipe", "pipe"],
});

// forward server stdout → Obsidian console
subprocess.stdout.on("data", (chunk) => {
  console.log(`[WS ⟶] ${chunk.toString().trim()}`);
});

// forward server stderr → Obsidian console
subprocess.stderr.on("data", (chunk) => {
  console.error(`[WS ERR] ${chunk.toString().trim()}`);
});

subprocess.on("exit", (code, signal) => {
  console.log(`[Plugin] WebSocket server exited code=${code} signal=${signal}`);
  if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
  if (code !== 0) new Notice(`Server exited unexpectedly: code ${code}`);
});

// unref so it doesn’t block Obsidian’s shutdown
subprocess.unref();
fs.writeFileSync(pidPath, String(subprocess.pid));
console.log(`[Plugin] Spawned server PID ${subprocess.pid}`);
    
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
