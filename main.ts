import {
    App,
    Plugin,
    PluginSettingTab,
    Setting,
    Notice,
    TFile,
} from 'obsidian';
import { registerAddKeyCommand } from './utils/add_key_command';
import { registerDeleteKeyCommand } from './utils/delete_key_command';
import { KeyListModal } from './settings/key_list_page02';
import { LinkNoteModal } from './settings/link_note_page03';
import { generateKey, addKey } from './storage/keyManager';
import { registerNoteWithPeer, requestNoteFromPeer } from './networking/socket/client';
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
import { registerPullNoteCommand } from "./utils/pull_note_command";
import { registerStartServerCommand, startWebSocketServerProcess } from "./utils/start_server_command";
import { registerShowIPCommand } from './utils/show_ip_command';
import { registerListSharedKeysCommand } from './utils/list_keys_command';
import { registerShareCurrentNoteCommand } from './utils/share_active_note';
import { registerSyncFromServerToSettings, syncRegistryFromServer } from './utils/sync_command';
import { registerUpdateRegistryCommand } from './utils/share_active_note';
import { registerAddPersonalCommentCommand } from './utils/addPersonalCommentCommand';
import { showAllPersonalCommentsForKey } from './utils/showCommentModal';
import { updateSubdomain, resolveIp } from './storage/DnsRegistryManager';
import { generateAndRegisterKey } from './utils/generateAndRegisterKey';
import { DDNS_DOMAIN, DDNS_PASSWORD } from "./constants";
import { getPublicIP, updateCloudflareDNS } from './utils/updateCloudflareDNS';



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
    content: string; // Added content property
}
interface MyPluginSettings {
    content: string;
    mySetting: string;
    keys: KeyItem[]; // Keys created by this user/plugin instance
    linkedKeys: KeyItem[]; // NEW: Keys received/linked from external sources
    registry: noteRegistry[];
    autoUpdateRegistry: boolean;
    personalComments: PersonalComment[];
    ddnsPassword: string
    myPeerId: string; 

}
interface CollaborationPluginSettings {
	ddnsPassword: string;
}


const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: 'default',
    keys: [
        { ip: 'default-ip-default_note', note: 'Default Shared Note', access: 'View' },
    ],
    linkedKeys: [], // NEW: Initialize as empty array
    registry: [],
    autoUpdateRegistry: true,
    personalComments: [],
    ddnsPassword: DDNS_PASSWORD,
    content: '',
    myPeerId: "peer1"
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



export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    registry: noteRegistry[] = []; // This will be deprecated in favor of settings.registry
    personalComments: PersonalComment[] = []; // Store personal comments

    async onload() {
        console.log("Loading collaboration plugin...");
        await this.loadSettings();

        // Start the HTTP server
        this.startServer();

        // Start WebSocket server
        startWebSocketServerProcess(this.app, this);

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
            id: "test-ddns-update",
            name: "Test DDNS Update",
            callback: async () => {
                const success = await updateSubdomain("peer1", DDNS_DOMAIN, DDNS_PASSWORD);
                new Notice(success ? "DDNS update successful!" : "DDS update failed.");
            }
        });
        this.addCommand({
            id: "test-generate-register-key",
            name: "Test Generate & Register Key",
            callback: async () => {
                const noteName = "TestNote";
                const access = "Edit";
                const key = await generateAndRegisterKey(this, noteName, access);
                console.log("Generated KeyItem:", key);
                new Notice(`Key generated for ${noteName}: ${key.ip}`);
            }
        });
        this.addCommand({
            id: "start-collaboration",
            name: "Start Collaboration Session",
            callback: async () => {
              const subdomain = `user-${Date.now()}`;
              const ip = await getPublicIP(); // Still needed
              const serverURL = "http://localhost:3000/register"; // DNS server
          
              try {
                const res = await fetch(serverURL, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({ subdomain, ip })
                });
          
                const data = await res.json();
          
                if (data.success) {
                  new Notice(`Subdomain: ${data.domain}`);
                } else {
                  new Notice("Failed to register domain.");
                  console.error(data);
                }
          
              } catch (err) {
                new Notice("DNS server request failed.");
                console.error(err);
              }
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
        await updateSubdomain("peer1", DDNS_DOMAIN, DDNS_PASSWORD);

        this.registerInterval(
            window.setInterval(async () => {
                await updateSubdomain("peer1", DDNS_DOMAIN, DDNS_PASSWORD);
            }, 15 * 60 * 1000)
        );
        setInterval(async () => {
            for (const key in this.linkedNotes) {
              await this.pullNoteByKey(key);
            }
          }, 5 * 60 * 1000); // 5 minutes
        
    

        // Listen for file changes if auto-update is enabled
        this.app.vault.on("modify", async (file) => {
            if (this.settings.autoUpdateRegistry) {
                if (file instanceof TFile) {
                    const key = file.basename; // Uses basename as key for auto-update
                    const content = await this.app.vault.read(file);
                    await updateNoteRegistry(this, key, content);
                    console.log(`[Auto-Update] Registry updated for note '${key}'.`);
                } else {
                    console.warn(`[Auto-Update] Skipped updating registry for non-TFile instance.`);
                }
            }
        });


        // Removed: Ribbon icon for quick key generation for the active note (direct action)
        /*
        this.addRibbonIcon('key', 'Generate Key for Active Note', async () => {
            const activeFile = this.app.workspace.getActiveFile();
            const noteName = activeFile ? activeFile.basename : 'No Active Note';
            const accessType = 'Edit'; // Default for generated keys

            if (!activeFile) {
                new Notice("No active note open to generate a key for. Please open a note.", 4000);
                return;
            }
            try {
                const newKeyItem = await generateKey(this, noteName, accessType);
                const success = await addKey(this, newKeyItem);
                if (success) {
                    new Notice(`Generated & Stored:\n${newKeyItem.ip}\nFor Note: "${newKeyItem.note}" (Access: ${newKeyItem.access})`, 6000);
                    await navigator.clipboard.writeText(newKeyItem.ip);
                } else {
                    new Notice('Failed to add generated key. It might already exist (password collision).', 4000);
                }
            } catch (error: any) {
                console.error("Error generating or adding key:", error);
                new Notice(`Error generating key: ${error.message}`, 5000);
            }
        }).addClass('my-plugin-ribbon-class');
        */

        // Removed: Ribbon icon for View All Collaboration Keys
        /*
        this.addRibbonIcon('list', 'View All Collaboration Keys', () => {
            new KeyListModal(this.app, this).open();
        });
        */

        // Removed: Ribbon icon for Link / Pull a Collaborative Note
        /*
        this.addRibbonIcon('link', 'Link / Pull a Collaborative Note', () => {
            new LinkNoteModal(this.app, this).open();
        });
        */
        this.addSettingTab(new PluginSettingsTab(this.app, this));
    }

    startServer() {
        const server = http.createServer((req, res) => {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("Collaboration Plugin Server is running.\n");
        });

        const PORT = 3000;
        server.listen(PORT, () => {
            console.log(`Server started on port ${PORT}`);
        });
    }


    onunload() {
        new Notice('Plugin is unloading!');
    
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
