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
import { PluginSettingsTab } from './settings/plugin_setting_tab';

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

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        console.log('loading collaborative-plugin');

        await this.loadSettings();

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


        // --- Ribbon Icons for Modals and Settings Tab ---

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

        // Start WebSocket server (if not already running)
        // startWebSocketServer(this.app, this); // Uncomment when ready

        // Example of requesting a note (placeholder)
        // requestNoteFromPeer(this.app, this, 'some-peer-id', 'some-note-key'); // Uncomment when ready
    }

    onunload() {
        console.log('unloading collaborative-plugin');
        // Any cleanup here (e.g., closing WebSocket connections)
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}