// main.ts
import {
    App,
    Plugin,
    PluginSettingTab,
    Setting,
    Modal,
    Notice,
} from 'obsidian';
import { registerGenerateKeyCommand } from './utils/generate_key_command';
import { registerAddKeyCommand } from './utils/add_key_command';
import { registerDeleteKeyCommand } from './utils/delete_key_command';
import { requestNoteFromPeer } from './networking/socket/client';
import { startWebSocketServer } from './networking/socket/server';
import { PluginSettingsTab } from './settings/plugin_setting_tab';
// We don't need to import SettingsModal at the top anymore if this specific icon won't open it.
// If your 'settings' icon still opens it, that import is fine.

import { generateKey, addKey } from './storage/keyManager'; // <--- Ensure these are imported for this action


export interface KeyItem {
    id: string; // This is the unique key string itself, like "obs-collab://..."
    note: string; // The note name associated with the key
    access: string; // The access type (e.g., "View", "Edit")
}

interface MyPluginSettings {
    mySetting: string;
    keys: KeyItem[]; // Now uses the new KeyItem interface
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: '',
    keys: [
        { id: 'obs-collab://192.168.1.42:3010/note/test', note: 'Default Shared Note', access: 'View' },
    ],
};

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        await this.loadSettings();

        // Register key commands
        registerGenerateKeyCommand(this.app, this);
        registerAddKeyCommand(this);
        registerDeleteKeyCommand(this);

        // --- CHANGE STARTS HERE for 'key' ribbon icon ---
        this.addRibbonIcon('key', 'Generate Key for Active Note', async () => {
            const activeFile = this.app.workspace.getActiveFile();
            const noteName = activeFile ? activeFile.basename : 'No Active Note'; // Get name of current note, or say "No Active Note"
            const accessType = 'Edit'; // Default access type for quick generation

            if (!activeFile) {
                new Notice("No active note open to generate a key for. Please open a note.", 4000);
                return;
            }

            try {
                // Generate the KeyItem (this includes the unique ID, note name, and access type)
                const newKeyItem = await generateKey(this, noteName, accessType);

                // Add this new KeyItem to the plugin's permanent storage and save it
                const success = await addKey(this, newKeyItem);

                if (success) {
                    new Notice(`Generated & Stored:\n${newKeyItem.id}\nFor Note: "${newKeyItem.note}" (Access: ${newKeyItem.access})`, 6000);
                } else {
                    // Our 'addKey' function already shows a notice if the key already exists,
                    // but this 'else' is a fallback for other unexpected issues.
                    new Notice('Failed to add generated key. It might already exist.', 4000);
                }
            } catch (error) {
                console.error("Error generating or adding key:", error);
                new Notice(`Error generating key: ${error.message}`, 5000);
            }
        }).addClass('my-plugin-ribbon-class');
        // --- CHANGE ENDS HERE ---


        this.addRibbonIcon('settings', 'Settings', async () => {
            // This icon will still open your main settings modal.
            // You might want to move the import of SettingsModal inside this callback
            // if you remove the general import from the top of the file.
            const { SettingsModal } = await import('./settings/main_page01');
            new SettingsModal(this.app, this).open();
        });

        this.addRibbonIcon('list', 'View Keys', async () => {
            const { KeyListModal } = await import('./settings/key_list_page02');
            new KeyListModal(this.app, this).open();
        });

        this.addRibbonIcon('link', 'Link Notes', async () => {
            const { LinkNoteModal } = await import('./settings/link_note_page03');
            new LinkNoteModal(this.app, this).open();
        });

        this.addCommand({
            id: 'generate-share-key',
            name: 'Generate Share Key',
            callback: async () => {
                const ip = await this.getUserIp('Enter your IP address:');
                const key = 'my-shared-note';
                const shareLink = `obs-collab://${ip}:3010/note/${key}`;
                startWebSocketServer(this.app, shareLink, 3010);
                await navigator.clipboard.writeText(shareLink);
                new Notice('Share key copied to clipboard');
            },
        });

        this.addCommand({
            id: 'pull-note-from-peer',
            name: 'Pull Note from Peer',
            callback: async () => {
                const shareKey = window.prompt('Paste the share key:');
                if (!shareKey) return;

                try {
                    const { ip, port, key } = parseShareKey(shareKey);
                    const wsUrl = `ws://${ip}:${port}`;
                    const content = await requestNoteFromPeer(wsUrl, key);
                    await this.app.vault.create('Pulled Note.md', content);
                    new Notice('Note pulled and created.');
                } catch (e) {
                    new Notice('Failed to pull note: ' + e);
                }
            },
        });

        function parseShareKey(shareKey: string): { ip: string; port: number; key: string } {
            const match = shareKey.match(/^obs-collab:\/\/([\d.]+):(\d+)\/note\/(.+)$/);
            if (!match) throw new Error('Invalid share key format');
            return { ip: match[1], port: parseInt(match[2]), key: match[3] };
        }

        this.addCommand({
            id: 'publish',
            name: 'Update Version',
            callback: () => {
                this.publishVersion();
            },
        });

        this.addSettingTab(new PluginSettingsTab(this.app, this));

        this.registerDomEvent(document, 'click', (evt: MouseEvent) => {});

        this.registerInterval(window.setInterval(() => console.log('Interval running'), 5 * 60 * 1000));
    }

    async getUserIp(promptText: string): Promise<string> {
        return await new Promise((resolve) => {
            const ip = window.prompt(promptText, '192.168.1.42');
            resolve(ip ?? '127.0.0.1');
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
    }
}