import { App, Plugin, PluginSettingTab, Setting, Modal, Notice } from 'obsidian';
import { registerGenerateKeyCommand } from './utils/generate_key_command';
import { registerAddKeyCommand } from './utils/add_key_command';
import { registerDeleteKeyCommand } from './utils/delete_key_command';
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
  keys: keyArray[];
}

interface keyArray{
	keys: string; 
}	

const DEFAULT_SETTINGS: MyPluginSettings = {
	keys: [
		{ keys: "obs-collab://192.168.1.42:3010/note/test" }
	],
	mySetting: ''
};

console.log("[Collab Plugin] Plugin script loaded");


export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;

  async onload() {
    await this.loadSettings();

	console.log("[Collab Plugin] Plugin onload() started");


    // Register key commands
    registerGenerateKeyCommand(this.app, this);
    registerAddKeyCommand(this);
    registerDeleteKeyCommand(this);

    // Ribbon: Generate Key
    this.addRibbonIcon('key', 'Generate Key', () => {
      new Notice('Generate a new key!');
    }).addClass('my-plugin-ribbon-class');

    // Ribbon: Open Settings Modal
    this.addRibbonIcon('settings', 'Settings', async () => {
      const { SettingsModal } = await import('./settings/main_page01');
      new SettingsModal(this.app, this).open();
    });

    // Ribbon: View Key List
    this.addRibbonIcon('list', 'View Keys', async () => {
      const { KeyListModal } = await import('./settings/key_list_page02');
      new KeyListModal(this.app, this).open();
    });

    // Ribbon: Link Note Modal
    this.addRibbonIcon('link', 'Link Notes', async () => {
      const { LinkNoteModal } = await import('./settings/link_note_page03');
      new LinkNoteModal(this.app, this).open();
    });
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
			console.error("[Plugin] server.cjs file not found at:", serverPath);
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
    this.publishVersion();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async publishVersion() {
    new Notice('Publishing new version...');
    // TODO: Add your real publish logic here
  }
}

class SampleSettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Setting #1')
      .setDesc('This is a secret setting')
      .addText((text) =>
        text
          .setPlaceholder('Enter your secret')
          .setValue(this.plugin.settings.mySetting)
          .onChange(async (value) => {
            this.plugin.settings.mySetting = value;
            await this.plugin.saveSettings();
          })
      );
  }
}