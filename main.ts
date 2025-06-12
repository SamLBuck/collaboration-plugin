import {
    App,
    Plugin,
    PluginSettingTab,
    Setting,
    Notice,
    TFile,
    WorkspaceLeaf, // Import WorkspaceLeaf
} from 'obsidian';
import { registerAddKeyCommand } from './utils/add_key_command';
import { registerDeleteKeyCommand } from './utils/delete_key_command';
import { KeyListModal } from './settings/key_list_page02'; // Still needed for ConfirmationModal
import { LinkNoteModal } from './settings/link_note_page03'; // Still needed for ConfirmationModal
import { generateKey, addKey } from './storage/keyManager';
import { registerNoteWithPeer, requestNoteFromPeer, sendNoteToHost } from './networking/socket/client';
import { PluginSettingsTab } from "./settings/plugin_setting_tab";
import { FileSystemAdapter } from "obsidian";
const { spawn } = require("child_process");
import * as path from "path";
import * as fs from "fs";
const noteRegistry = require("./networking/socket/dist/noteRegistry.cjs");
import * as http from "http";
import { tempKeyInputModal } from "./settings/tempKeyInputModal";
import { tempIPInputModal } from "./settings/tempIPInputModal";
import { getLocalIP } from "./utils/get-ip"
import { registerGenerateKeyCommand } from './utils/generate_key_command';
import { registerPullNoteCommand } from './utils/pull_note_command';
import { registerStartServerCommand, startWebSocketServerProcess } from './utils/start_server_command';
import { registerShowIPCommand } from './utils/show_ip_command';
import { registerListSharedKeysCommand } from './utils/list_keys_command';
import { registerShareCurrentNoteCommand } from './utils/share_active_note';
import { registerSyncFromServerToSettings, syncRegistryFromServer } from './utils/sync_command';
import { registerUpdateRegistryCommand } from './utils/share_active_note';
import { registerAddPersonalCommentCommand } from './utils/addPersonalCommentCommand';
import { showAllPersonalCommentsForKey } from './utils/showCommentModal';

// Import the new Collaboration Panel Views
import { CollaborationPanelView, COLLABORATION_VIEW_TYPE } from './views/CollaborationPanelView';
import { KeyListView, KEY_LIST_VIEW_TYPE } from './views/KeyListView';
import { LinkNoteView, LINK_NOTE_VIEW_TYPE } from './views/LinkNoteView';
import { NoteManager } from "./networking/socket/NoteManager";


export type NoteRegistry = Record<string, string>; // key => content

export interface PersonalComment {
    key: string;            // matches key used to identify the shared note
    line: number;           // approximate line number in the note
    column: number;         // optional: horizontal offset
    content: string;        // the actual comment content
}

export interface KeyItem {
    ip: string; // This now stores the full key string (e.g., "IP-NoteName")
    note: string; // The parsed note name
    access: string; // The access type (e.g., "Edit", "View", "Pulled")
}
interface noteRegistry {
    key: string;
    content: string;
}
interface MyPluginSettings {
    mySetting: string;
    keys: KeyItem[]; // Keys created by this user/plugin instance
    linkedKeys: KeyItem[]; // NEW: Keys received/linked from external sources
    registry: noteRegistry[];
    autoUpdateRegistry: boolean;
    personalComments: PersonalComment[];

}

const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: 'default',
    keys: [], // MODIFIED: Removed the default key entry here
    linkedKeys: [], // 
    registry: [],
    autoUpdateRegistry: false, // changed to test whether the push note works. 
    personalComments: [],

};

export function getNoteRegistry(plugin: MyPlugin): noteRegistry[] {
    return plugin.settings?.registry ?? [];
}

export async function updateNoteRegistry(plugin: MyPlugin, key: string, content: string) {
    let registry = getNoteRegistry(plugin);

    registry = registry.filter(item => item.key !== key);
    registry.push({ key, content });

    plugin.settings.registry = registry;
    await plugin.saveSettings();
}

export async function deleteNoteFromRegistry(plugin: MyPlugin, key: string) {
    let registry = getNoteRegistry(plugin);
    registry = registry.filter(item => item.key !== key);
    plugin.settings.registry = registry;
    await plugin.saveSettings();
    console.log(`[Delete Note] Key '${key}' deleted. Updated registry:`, registry);
}
export function getNoteContentByKey(plugin: MyPlugin, key: string): string | undefined {
    const registry = getNoteRegistry(plugin);
    return registry.find(item => item.key === key)?.content;
}

function hasEditAccess(plugin: MyPlugin, note: string): boolean {
    return plugin.settings.keys.some(k => k.note === note && k.access === "Edit") ||
           plugin.settings.linkedKeys.some(k => k.note === note && k.ip.includes("|Edit"));
  }
  
  function pushNoteToHost(plugin: MyPlugin, note: string, content: string ) {
    const key = plugin.settings.linkedKeys.find(k =>
      k.note.trim().toLowerCase() === note.trim().toLowerCase() &&
      k.ip.includes("|Edit")
    );
    if (!key) {
      new Notice(`No edit link found for '${note}'`, 4000);
      return;
    }
  
    const ipSegment = key.ip.split("|")[0]; // "10.19.21.190-noteName"
    const ip = ipSegment.split("-")[0];     // "10.19.21.190"
    console.log("ip" + ip)
    console.log("note name" + note)
    console.log("content" + content)
    sendNoteToHost(ip, note, content);  // ✅ now correctly references push-note logic
    new Notice(`Pushed '${note}' to host at ${ip}`, 4000);
  }
    
  export function waitForWebSocketConnection(url: string, plugin: MyPlugin, retries = 15): void {
	let attempt = 0;

	const tryConnect = () => {
		const socket = new WebSocket(url);

		socket.onopen = () => {
			console.log("[Plugin] Connected to WebSocket server");
		};

		socket.onerror = (err: Event) => {
			console.warn(`[Plugin] Attempt ${attempt + 1} failed to connect to WebSocket server`, err);

			if (++attempt < retries) {
				setTimeout(tryConnect, 300);
			} else {
				console.error("[Plugin] Failed to connect to WebSocket server after multiple attempts.");
			}
		};

		socket.onmessage = async (event: MessageEvent) => {
			try {
				const msg = JSON.parse(event.data.toString());

				if (msg.type === "push-note") {
					const { key, content } = msg.payload;
					console.log(`[Plugin] Received push-note for '${key}'`);

					const noteManager = new NoteManager(plugin, "ws://localhost:3010");
					await noteManager.handleIncomingPush(key, content);
				}
			} catch (err) {
				console.error("[Plugin] Failed to parse incoming WebSocket message:", err);
			}
		};

		socket.onclose = () => {
			console.log("[Plugin] WebSocket connection closed.");
		};
	};

	tryConnect();
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    registry: noteRegistry[] = []; // This will be deprecated in favor of settings.registry
    personalComments: PersonalComment[] = []; // Store personal comments
    autoRegistryUpdate: boolean = false; // Auto-update registry setting

    async onload() {
        console.log("Loading collaboration plugin...");
        await this.loadSettings();
        // Sart WebSocket server
startWebSocketServerProcess(this.app, this);

waitForWebSocketConnection("ws://localhost:3010", this);


        // Register custom commands (Command Palette commands)
        registerGenerateKeyCommand(this.app, this);
        registerAddKeyCommand(this);
        registerDeleteKeyCommand(this);
        registerStartServerCommand(this.app, this);
        registerShowIPCommand(this.app, this);
        registerPullNoteCommand(this.app, this);
        registerListSharedKeysCommand(this);
        registerShareCurrentNoteCommand(this);
        registerUpdateRegistryCommand(this);
        registerAddPersonalCommentCommand(this);


        this.addCommand({
            id: 'delete-note-from-registry',
            name: 'Delete Note from Registry',
            callback: async () => {
                const modal = new tempKeyInputModal(this.app, async (key) => {
                    if (!key) {
                        new Notice("No key provided. Deletion canceled.");
                        return;
                    }
                    const noteContent = getNoteContentByKey(this, key);
                    if (!noteContent) {
                        new Notice(`No note found with key '${key}'.`);
                        return;
                    }
                    await deleteNoteFromRegistry(this, key);
                    new Notice(`Note with key '${key}' deleted from registry.`);
                });
                modal.open();
            },
        });

        this.addCommand({
            id: "manually-push-note-to-host",
            name: "Manually Push Active Note to Host",
            callback: async () => {
              const file = this.app.workspace.getActiveFile();
              if (!file) {
                new Notice("No active note open.");
                return;
              }
          
              const note = file.basename;
          
              const editKey = this.settings.linkedKeys.find(k =>
                k.note === note && k.ip.includes("|Edit")
              );
              if (!editKey) {
                new Notice("You do not have edit access to push this note.");
                return;
              }
          
              const ip = editKey.ip.split("|")[0].split("-")[0]; // extract "10.19.21.190"
              const content = await this.app.vault.read(file);
              console.log(`Pushing note '${note}' to host at ${ip}...`);
              pushNoteToHost(this, note, content);
            }
          });
          

        this.registerEvent(
            this.app.workspace.on("file-open", (file) => {
                if (!file) return;
                const key = file.basename;
                const comments = this.settings.personalComments || [];
                showAllPersonalCommentsForKey(this.app, key, comments);
            })
        );
        
        // Register all Collaboration Panel Views
        this.registerView(
            COLLABORATION_VIEW_TYPE,
            (leaf) => new CollaborationPanelView(leaf, this)
        );
        this.registerView(
            KEY_LIST_VIEW_TYPE,
            (leaf) => new KeyListView(leaf, this)
        );
        this.registerView(
            LINK_NOTE_VIEW_TYPE,
            (leaf) => new LinkNoteView(leaf, this)
        );

        const statusBarItemEl = this.addStatusBarItem();
        statusBarItemEl.setText('Control Panel');
        statusBarItemEl.onClickEvent(() => {
            this.activateView(COLLABORATION_VIEW_TYPE); // Open the main control panel
        });
        statusBarItemEl.addClass('collaboration-status-bar-item');
        // --- END ACTIVE ---


        // // Listen for file changes if auto-update is enabled
        // this.app.vault.on("modify", async (file) => {
        //     if (this.settings.autoUpdateRegistry) {
        //         if (file instanceof TFile) {
        //             const key = file.basename; // Uses basename as key for auto-update
        //             const content = await this.app.vault.read(file);
        //             await updateNoteRegistry(this, key, content);
        //             console.log(`[Auto-Update] Registry updated for note '${key}'.`);
        //         } else {
        //             console.warn(`[Auto-Update] Skipped updating registry for non-TFile instance.`);
        //         }
        //     }
        // });


        this.addSettingTab(new PluginSettingsTab(this.app, this));
    }

    // New method to activate/open a specific collaboration panel view
    async activateView(viewType: string) {
        let leaf: WorkspaceLeaf | null = null;

        // 1. Try to find an existing leaf of the target view type
        const existingTargetLeaves = this.app.workspace.getLeavesOfType(viewType);
        if (existingTargetLeaves.length > 0) {
            leaf = existingTargetLeaves[0]; // Use the first existing leaf
        } else {
            // 2. If no existing leaf of the target type, try to reuse the current active leaf
            //    if it's one of *our* plugin's views.
            const currentActiveLeaf = this.app.workspace.activeLeaf;
            if (currentActiveLeaf && (
                currentActiveLeaf.view.getViewType() === COLLABORATION_VIEW_TYPE ||
                currentActiveLeaf.view.getViewType() === KEY_LIST_VIEW_TYPE ||
                currentActiveLeaf.view.getViewType() === LINK_NOTE_VIEW_TYPE
            )) {
                leaf = currentActiveLeaf;
            } else {
                // 3. If neither, get a new right leaf.
                leaf = this.app.workspace.getRightLeaf(true); // `true` means create if not found
            }
        }
        
        if (leaf) {
            await leaf.setViewState({
                type: viewType,
                active: true,
            });
            // Reveal the leaf in case the sidebar is collapsed
            this.app.workspace.revealLeaf(leaf);
        } else {
            new Notice(`Failed to open ${viewType} panel.`, 4000);
            console.error(`Collaboration Panel: Could not obtain a workspace leaf for ${viewType}.`);
        }
    }

    onunload() {
        new Notice('Plugin is unloading!');
        
        // Detach all custom views when the plugin unloads
        this.app.workspace.detachLeavesOfType(COLLABORATION_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(KEY_LIST_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(LINK_NOTE_VIEW_TYPE);

        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter)) return;
        
        const vaultPath = adapter.getBasePath();
        const pidPath = path.join(
            vaultPath,
            ".obsidian",
            "plugins",
            "collaboration-plugin",
            "ws-server.pid"
        );
        
        if (fs.existsSync(pidPath)) {
            const pid = parseInt(fs.readFileSync(pidPath, "utf8"));
            if (!isNaN(pid)) {
                try {
                    process.kill(pid);
                    console.log(`[Plugin] Cleanly killed previous WebSocket server with PID ${pid}`);
                } catch (err) {
                    console.warn(`[Plugin] Failed to kill server PID ${pid}:`, err);
                }
            }
            fs.unlinkSync(pidPath);
        }
    }
        async loadSettings() {
        const raw = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, raw ?? {});
        this.registry = this.settings.registry;
        this.personalComments = this.settings.personalComments;
    }
    
    async saveSettings() {
        // Save all settings, including linkedKeys
        await this.saveData(this.settings);
    }


}
