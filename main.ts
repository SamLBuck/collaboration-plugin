import {
    App,
    Plugin,
    PluginSettingTab,
    Setting,
    Notice,
} from 'obsidian';
import { registerAddKeyCommand } from './utils/add_key_command';
import { registerDeleteKeyCommand } from './utils/delete_key_command';
import { KeyListModal } from './settings/key_list_page02';
import { LinkNoteModal } from './settings/link_note_page03';
import { generateKey, addKey } from './storage/keyManager';
import { registerNoteWithPeer, requestNoteFromPeer } from './networking/socket/client';
import { PluginSettingsTab } from "./settings/plugin_setting_tab";
import { parseShareKey } from "./utils/parse_key";
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
import { registerShowIPCommand } from "./utils/show_ip_command";
import { registerListSharedKeysCommand } from './utils/list_keys_command';
import { registerShareCurrentNoteCommand } from './utils/share_active_note';
import { registerSyncFromServerToSettings, syncRegistryFromServer } from './utils/sync_command';
export type NoteRegistry = Record<string, string>; // key => content


export interface KeyItem {
    id: string;
    note: string;
    access: string;
}
interface noteRegistry {
    key: string;
    content: string;
}
interface MyPluginSettings {
    mySetting: string;
    keys: KeyItem[];
    registry: noteRegistry[];
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: 'default',
    keys: [
        { id: 'defaultpass123', note: 'Default Shared Note', access: 'View' },
    ],
    registry: [],
};

export function getNoteRegistry(plugin: MyPlugin): noteRegistry[] {
    return plugin.settings?.registry ?? [];
}

export async function updateNoteRegistry(plugin: MyPlugin, key: string, content: string) {
    let registry = getNoteRegistry(plugin);

    const existingIndex = registry.findIndex(item => item.key === key);
    if (existingIndex !== -1) {
        registry[existingIndex].content = content;
    } else {
        registry.push({ key, content });
    }

    plugin.settings.registry = registry;
    await plugin.saveSettings();
}

export async function deleteNoteFromRegistry(plugin: MyPlugin, key: string) {
    let registry = getNoteRegistry(plugin);
    registry = registry.filter(item => item.key !== key);
    plugin.settings.registry = registry;
    await plugin.saveSettings();
}
export function getNoteContentByKey(plugin: MyPlugin, key: string): string | undefined {
    const registry = getNoteRegistry(plugin);
    return registry.find(item => item.key === key)?.content;
}



export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    registry: noteRegistry[] = [];


    async onload() {
        await this.loadSettings();

        // Start the HTTP server
        this.startServer();

        // Register custom commands (Command Palette commands)

        

        registerGenerateKeyCommand(this.app, this);
        registerAddKeyCommand(this);
        registerDeleteKeyCommand(this);
        registerStartServerCommand(this.app, this);
        registerShowIPCommand(this.app, this);
        registerPullNoteCommand(this.app, this);
        registerListSharedKeysCommand(this);
        registerShareCurrentNoteCommand(this);
        registerSyncFromServerToSettings(this);


        this.addCommand({
            id: "debug-print-registry",
            name: "Debug: Print Saved Registry",
            callback: async () => {
                console.log("[Registry] Current stored registry:", this.settings.registry);
                new Notice(`Registry contains ${this.settings.registry.length} item(s). Check console for full output.`);
            }
        });
        


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

// Removed the 'settings' ribbon icon as requested.
// Users can still access plugin settings via Obsidian's main Settings -> Community Plugins.

this.addRibbonIcon('list', 'View All Collaboration Keys', () => {
    new KeyListModal(this.app, this).open();
});
this.addRibbonIcon('link', 'Link / Pull a Collaborative Note', () => {
    new LinkNoteModal(this.app, this).open();
});
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
        // Add any cleanup logic here if needed
    }
    async loadSettings() {
        const raw = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, raw?.settings ?? {});
        this.registry = raw?.registry ?? this.settings.registry ?? [];
        this.settings.registry = this.registry;
    }
    
    async saveSettings() {
        await this.saveData({
            settings: this.settings,
            registry: this.registry
        })

    }
}
