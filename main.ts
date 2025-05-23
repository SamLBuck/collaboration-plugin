import {
    App,
    Plugin,
    PluginSettingTab,
    Setting,
    Notice,
    FileSystemAdapter, // This was already here from previous versions
} from 'obsidian';

// Core command registrations
import { registerAddKeyCommand } from './utils/add_key_command';
import { registerDeleteKeyCommand } from './utils/delete_key_command';

// Main Plugin Settings Tab (accessible via Obsidian's main settings)
import { PluginSettingsTab } from './settings/plugin_setting_tab';

// Modals for ribbon icons (these are now back to being separate pop-ups)
import { KeyListModal } from './settings/key_list_page02';
import { LinkNoteModal } from './settings/link_note_page03';

// Key management functions
import { generateKey, addKey } from './storage/keyManager';

// Networking and utility imports
import { registerNoteWithPeer, requestNoteFromPeer } from './networking/socket/client';
import { parseShareKey } from "./utils/parse_key"; // Still imported but not directly used in main.ts anymore
import { tempKeyInputModal } from "./settings/tempKeyInputModal"; // Still imported but not directly used in main.ts anymore
import { tempIPInputModal } from "./settings/tempIPInputModal";   // Still imported but not directly used in main.ts anymore
import { getLocalIP } from "./utils/get-ip"; // Still imported but not directly used in main.ts anymore

// Node.js specific imports for spawning server (will only work in Electron environment)
// Note: These are now typically handled by registerStartServerCommand
import * as path from "path"; // Still imported but not directly used in main.ts anymore
import * as fs from "fs";     // Still imported but not directly used in main.ts anymore
const noteRegistry = require("./networking/socket/dist/noteRegistry.cjs"); // Still imported but not directly used in main.ts anymore

// New utility imports that now register commands (from your recent refactoring)
import { registerGenerateKeyCommand } from './utils/generate_key_command';
import { registerPullNoteCommand } from "./utils/pull_note_command";
import { registerStartServerCommand } from "./utils/start_server_command";
import { registerShowIPCommand } from "./utils/show_ip_command";

// --- Custom Types and Interfaces (from your recent additions) ---
export type NoteRegistry = Record<string, string>; // key => content

export interface KeyItem {
    id: string;
    note: string;
    access: string;
}

interface noteRegistry { // Note: lowercase 'n' suggests this is a single item type, not the registry itself
    key: string;
    content: string;
}

interface MyPluginSettings {
    mySetting: string;
    keys: KeyItem[];
    registry: noteRegistry[]; // NEW: Added registry to plugin settings
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: 'default',
    keys: [
        { id: 'defaultpass123', note: 'Default Shared Note', access: 'View' },
    ],
    registry: [], // NEW: Initialize registry in default settings
};

// NEW: Exported functions for managing the note registry
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
// --- End Custom Types and Interfaces ---


// console.log("[Collab Plugin] Plugin script loaded"); // This line was removed in your last update

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        await this.loadSettings();
        this.addStyle(); // ADDED: Loads your plugin's stylesheet (styles.css)

        // Register custom commands (Command Palette commands)
        // These are now handled by separate utility files
        registerGenerateKeyCommand(this.app, this);
        registerAddKeyCommand(this);
        registerDeleteKeyCommand(this);
        registerStartServerCommand(this.app, this); // NEW command registration
        registerShowIPCommand(this.app, this);     // NEW command registration
        registerPullNoteCommand(this.app, this);   // NEW command registration


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

        // List (Bullet List) icon: Opens the Key List MODAL DIRECTLY
        this.addRibbonIcon('list', 'View All Collaboration Keys', () => {
            new KeyListModal(this.app, this).open();
        });

        // Link (Link Chain) icon: Opens the Link Note MODAL DIRECTLY
        this.addRibbonIcon('link', 'Link / Pull a Collaborative Note', () => {
            new LinkNoteModal(this.app, this).open();
        });

        // Register the main settings tab (accessible via plugin list in Obsidian settings)
        this.addSettingTab(new PluginSettingsTab(this.app, this));
    }
	addStyle() {
		throw new Error('Method not implemented.');
	}

    onunload() {
        new Notice('Plugin is unloading!'); // Changed notice message
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}