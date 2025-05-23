import {
    App,
    Plugin,
    PluginSettingTab,
    Setting,
    Notice,
} from 'obsidian';
import { registerGenerateKeyCommand } from './utils/generate_key_command';
import { registerAddKeyCommand } from './utils/add_key_command';
import { registerDeleteKeyCommand } from './utils/delete_key_command';

// Import the PluginSettingsTab for general settings
//import { PluginSettingsTab } from './settings/plugin_setting_tab';

// Import the new Modals for pop-up functionality
import { KeyListModal } from './settings/key_list_page02';
import { LinkNoteModal } from './settings/link_note_page03';

// Import key management functions for quick key generation
import { generateKey, addKey } from './storage/keyManager';


export interface KeyItem {
    id: string; // This is the unique key string itself (now a password)
    note: string; // The note name associated with the key
    access: string; // The access type (e.g., "View", "Edit")
}
import { registerNoteWithPeer, requestNoteFromPeer } from './networking/socket/client';
import { PluginSettingsTab } from "./settings/plugin_setting_tab";
import { parseShareKey } from "./utils/parse_key";
import { FileSystemAdapter } from "obsidian";
//const { startWebSocketServer } = require("./networking/socket/server.cjs");
const { spawn } = require("child_process");
import * as path from "path";
import * as fs from "fs";
const noteRegistry = require("./networking/socket/dist/noteRegistry.cjs");
import { tempKeyInputModal } from "./settings/tempKeyInputModal";
import { tempIPInputModal } from "./settings/tempIPInputModal";
import { getLocalIP } from "./utils/get-ip"




interface MyPluginSettings {
    mySetting: string;
    keys: KeyItem[];
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: 'default',
    keys: [
        { id: 'defaultpass123', note: 'Default Shared Note', access: 'View' },
    ],
};

console.log("[Collab Plugin] Plugin script loaded");


export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

  async onload() {
    await this.loadSettings();

	console.log("[Collab Plugin] Plugin onload() started");


        // Register custom commands (Command Palette commands)
        // Ensure 'utils' folder and these files exist and their imports are correct
        registerGenerateKeyCommand(this.app, this);
        registerAddKeyCommand(this);
        registerDeleteKeyCommand(this);

        // Ribbon icon for quick key generation for the active note (direct action)
        this.addRibbonIcon('key', 'Generate Key for Active Note', async () => {
            const activeFile = this.app.workspace.getActiveFile();
            const noteName = activeFile ? activeFile.basename : 'No Active Note';
            const accessType = 'Edit';

            if (!activeFile) {
                new Notice("No active note open to generate a key for. Please open a note.", 4000);
                return;
            }

            try {
                const newKeyItem = await generateKey(this, noteName, accessType);
                const success = await addKey(this, newKeyItem);

                if (success) {
                    new Notice(`Generated & Stored:\n${newKeyItem.id}\nFor Note: "${newKeyItem.note}" (Access: ${newKeyItem.access})`, 6000);
                } else {
                    new Notice('Failed to add generated key. It might already exist (password collision).', 4000);
                }
            } catch (error) {
                console.error("Error generating or adding key:", error);
                new Notice(`Error generating key: ${error.message}`, 5000);
            }
        }).addClass('my-plugin-ribbon-class');

// Settings (Gear) icon: Opens the main Collaboration Settings tab
this.addRibbonIcon('settings', 'Open Collaboration Settings', () => {
    // This opens the main Obsidian settings modal and navigates to your plugin's tab
    (this.app as any).setting.open();
    (this.app as any).setting.openTabById(PluginSettingsTab.PLUGIN_ID);
});

// List (Bullet List) icon: Opens the Key List MODAL DIRECTLY
this.addRibbonIcon('list', 'View All Collaboration Keys', () => {
    new KeyListModal(this.app, this).open(); // <--- Opens the modal pop-up
});

// Link (Link Chain) icon: Opens the Link Note MODAL DIRECTLY
this.addRibbonIcon('link', 'Link / Pull a Collaborative Note', () => {
    new LinkNoteModal(this.app, this).open(); // <--- Opens the modal pop-up
});

// --- End of Ribbon Icons ---


// Register the main settings tab (accessible via plugin list in Obsidian settings)
// This is the instance that will be opened by openTabById.
this.addSettingTab(new PluginSettingsTab(this.app, this));

this.addCommand({
		id: "generate-share-key",
		name: "Generate Share Key",
		callback: async () => {
		  //const ip = await this.getUserIp("Enter your IP address:");
		  const key = "my-shared-note";
		  //const shareLink = `obs-collab://${ip}:3010/note/${key}`;
		  //startWebSocketServer(this.app, shareLink, 3010); // should be called before sharing
		  //const ip = await this.getUserIp("Enter your IP address:");
		  //await navigator.clipboard.writeText(shareLink);
		  new Notice("Share key copied to clipboard");
		}
	  });

    // Pull note from peer command
	  this.addCommand({
		id: "pull-test-note-from-peer",
		name: "Pull Test Note from Server Registry (localhost)",
		callback: async () => {
			console.log("[Plugin] Starting requestNoteFromPeer for key 'TestNote'");
		  try {
			const content = await requestNoteFromPeer("ws://localhost:3010", "key");
	  
			console.log("[Plugin] Note content received:", content);

			await this.app.vault.create("Pulled Test Note.md", content);
			new Notice("Note pulled and created");
		  } catch (err) {
			console.error("Failed to pull note:", err);
			new Notice("Failed to pull note");
		  }
		}
	  });
	  this.addCommand({
		id: "pull-note-from-peer-modal",
		name: "Pull Note from Server Registry (enter key)",
		callback: () => {
		  new tempKeyInputModal(this.app, async (key: string) => {
			try {
			  const content = await requestNoteFromPeer("ws://localhost:3010", key);
			  await this.app.vault.create(`${key}.md`, content);
			  new Notice(`Note '${key}' pulled and created.`);
			} catch (err) {
			  console.error("Failed to pull note:", err);
			  new Notice(`Failed to pull note: ${err}`);
			}
		  }).open();
		},
	  });

	  this.addCommand({
		id: "pull-note-from-peer-modal",
		name: "Pull Note from Server Registry (enter key and IP)",
		callback: () => {
		  new tempIPInputModal(this.app, async (ip: string, key: string) => {
			try {
			  const content = await requestNoteFromPeer("ws://" + ip + ":" + "3010", key);
			  await this.app.vault.create(`${key}.md`, content);
			  new Notice(`Note '${key}' pulled and created.`);
			} catch (err) {
			  console.error("Failed to pull note:", err);
			  new Notice(`Failed to pull note: ${err}`);
			}
		  }).open();
		},
	  });

	  

	  
	  	
	
	this.addCommand({
		id: "start-websocket-server",
		name: "Start WebSocket Server",
		callback: () => {
		  const adapter = this.app.vault.adapter;
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
			console.error("[Plugin] server.cjs file not found at:", serverPath); // doesn't work on computer that is not mine
			return;
		  }
		  console.log("[Plugin] Launching server at:", serverPath);
	  
		  const subprocess = spawn("node", [serverPath], {
			shell: false,
			//detached: false
		  });
	  
		  subprocess.stdout.on("data", (data: { toString: () => any; }) => {
			console.log("[WS Server]:", data.toString());
		  });
	  
		  subprocess.stderr.on("data", (err: { toString: () => any; }) => {
			console.error("[WS Server Error]:", err.toString());
		  });
	  
		  subprocess.on("exit", (code: any) => {
			console.log(`[WS Server] Exited with code ${code}`);
		  });
	  
		  new Notice("Started WebSocket server.");
		}
	  });


	  this.addCommand({
		id: "share-current-note",
		name: "Register Active Note",
		callback: async () => {
		  const file = this.app.workspace.getActiveFile();
		  if (!file) {
			new Notice("No active file.");
			return;
		  }
		  const content = await this.app.vault.read(file);
		  const key = file.basename;
	  
		  registerNoteWithPeer("ws://localhost:3010", key, content); //
	  
		  new Notice(`Note '${key}' sent to peer for sharing.`);
		}
	  });

	  this.addCommand({
		id: "list-shared-note-keys",
		name: "List Shared Note Keys from server registry",
		callback: async () => {
		  const ip = "localhost"; // or use a modal to get user input
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
			}
		  };
	  
		  socket.onerror = (err) => {
			console.error("Failed to connect to peer:", err);
			new Notice("Connection error.");
		  };
		}
	  });

	  this.addCommand({
		id: "show-local-ip",
		name: "Show This Computer's Local IP",
		callback: async () => {
		  const ip = getLocalIP();
		  await navigator.clipboard.writeText(ip);
		  console.log("Copied Local IP Address to clipboard:", ip);
		  new Notice("Copied Local IP Address to clipboard:: " + ip);
		}
	  });
	  
	  
	}

	  
  
  onunload() {
    new Notice('Plugin is unloading!');
   // this.publishVersion();
  }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

// Hello