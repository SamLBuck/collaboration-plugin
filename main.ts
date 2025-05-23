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
import { tempKeyInputModal } from "./settings/tempKeyInputModal";
import { tempIPInputModal } from "./settings/tempIPInputModal";
import { getLocalIP } from "./utils/get-ip"
import { registerGenerateKeyCommand } from './utils/generate_key_command';
import { registerPullNoteCommand } from "./utils/pull_note_command";
import { registerStartServerCommand, startWebSocketServerProcess } from "./utils/start_server_command";
import { registerShowIPCommand } from "./utils/show_ip_command";
import { registerListSharedKeysCommand } from 'utils/list_keys_command';
import { registerShareCurrentNoteCommand } from 'utils/share_active_note_command';
import { registerSyncAllNotesCommand } from 'utils/sync_command';
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

    async onload() {
        await this.loadSettings();

        registerGenerateKeyCommand(this.app, this);
        registerAddKeyCommand(this);
        registerDeleteKeyCommand(this);
        registerStartServerCommand(this.app, this);
        registerShowIPCommand(this.app, this);
        registerPullNoteCommand(this.app, this);
        registerListSharedKeysCommand(this);
        registerShareCurrentNoteCommand(this);
        registerSyncAllNotesCommand(this);






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

    onunload() {
        new Notice('Plugin is unloading!');
    }
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
