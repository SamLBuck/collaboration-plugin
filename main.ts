// main.ts
import {
    App,
    Plugin,
    PluginSettingTab,
    Setting,
    Notice,
    TFile,
    WorkspaceLeaf,
    WorkspaceTabs,
    WorkspaceSidedock,
    Editor, // NEW: Import Editor for cursor position
	MarkdownView,
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
// Removed: registerAddPersonalCommentCommand and showAllPersonalCommentsForKey
// import { registerAddPersonalCommentCommand } from './utils/addPersonalCommentCommand';
// import { showAllPersonalCommentsForKey } from './utils/showCommentModal';
import { v4 as uuidv4 } from 'uuid'; // NEW: For generating unique IDs for personal notes

// --- MODIFIED IMPORTS:
// Import view type constants from the central constants file
import { COLLABORATION_VIEW_TYPE, KEY_LIST_VIEW_TYPE, LINK_NOTE_VIEW_TYPE, PERSONAL_NOTES_VIEW_TYPE } from './constants/viewTypes';
// Import view classes individually from their respective view files
import { CollaborationPanelView } from './views/CollaborationPanelView';
import { KeyListView } from './views/KeyListView';
import { LinkNoteView } from './views/LinkNoteView';
// --- END MODIFIED IMPORTS ---


export type NoteRegistry = Record<string, string>; // key => content

// --- MODIFIED: PersonalNote Interface (based on our discussion) ---
export interface PersonalNote {
    id: string;             // Unique ID (UUID)
    targetFilePath: string; // Full path to the Obsidian note file (e.g., "Daily Notes/2025-06-11.md")
    lineNumber: number;     // The 0-indexed line number in the target file
    title?: string;         // Optional user-defined title for the personal note
    content: string;        // The main text of the personal note
    createdAt: number;      // Timestamp of creation (for sorting)
    updatedAt: number;      // Timestamp of last modification
    isExpanded?: boolean;   // UI state: whether this note is currently expanded in the view
}
// --- END MODIFIED ---


export interface KeyItem {
    content: any;
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
    personalNotes: PersonalNote[]; // MODIFIED: Renamed and type changed for personal notes

}

const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: 'default',
    keys: [],
    linkedKeys: [],
    registry: [],
    autoUpdateRegistry: true,
    personalNotes: [], // MODIFIED: Initialize as empty array for new PersonalNote interface

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
    console.log(ip)
    console.log(note)
    console.log(content)
    sendNoteToHost(ip, note, content);  // ✅ now correctly references push-note logic
    new Notice(`Pushed '${note}' to host at ${ip}`, 4000);
  }
    

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    registry: noteRegistry[] = []; // This will be deprecated in favor of settings.registry
    // Removed: personalComments property as it's now part of settings
    // personalComments: PersonalComment[] = [];

    autoRegistryUpdate: boolean = false; // Auto-update registry setting

    async onload() {
        console.log("Loading collaboration plugin...");
        await this.loadSettings();


        // Sart WebSocket server
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
        // Removed old personal comment command registration
        // registerAddPersonalCommentCommand(this);


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
          

        /*this.registerEvent(
            this.app.workspace.on("file-open", (file) => {
                if (!file) return;
                const key = file.basename;
                const comments = this.settings.personalComments || [];
                showAllPersonalCommentsForKey(this.app, key, comments);
            })
        );
        */

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


        // Ribbon icon to open your Collaboration Panel (re-added as per previous requests)
        this.addRibbonIcon('share', 'Open Collaboration Panel', () => {
            console.log("Ribbon icon clicked! Calling activateView for Collaboration Panel")
            this.activateView(COLLABORATION_VIEW_TYPE); // Open the main control panel
        });

        // NEW: Ribbon icon for creating a personal note
        this.addRibbonIcon('sticky-note', 'Create Personal Note', async () => {
            const activeFile = this.app.workspace.getActiveFile();
            // Get the active Markdown view, which contains the editor
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

            if (!activeFile) {
                new Notice("Please open a note to create a personal note.", 3000);
                return;
            }

            // Check if there's an active Markdown editor view
            if (!activeView) {
                new Notice("No active Markdown editor found. Please focus on a note.", 3000);
                return;
            }

            // Now, safely access the editor object from the activeView
            const editor = activeView.editor;
            const lineNumber = editor.getCursor().line;

            const newPersonalNote: PersonalNote = {
                id: uuidv4(), // Generate a unique ID
                targetFilePath: activeFile.path,
                lineNumber: lineNumber,
                title: '', // Start with an empty title
                content: '', // Start with empty content
                createdAt: Date.now(),
                updatedAt: Date.now(),
                isExpanded: true, // Auto-expand when created
            };
        
            this.settings.personalNotes.push(newPersonalNote);
            await this.saveSettings();
            new Notice(`New personal note created for "${activeFile.basename}" at line ${lineNumber + 1}.`, 3000);
        
            // Activate the Personal Notes view and trigger a re-render
            await this.activateView(PERSONAL_NOTES_VIEW_TYPE);
            this.app.workspace.trigger('plugin:personal-notes-updated'); // Trigger custom event for view update
        });


        // --- ACTIVE: Original StatusBar Item ---
        //const statusBarItemEl = this.addStatusBarItem();
        //statusBarItemEl.setText('Control Panel');
        //statusBarItemEl.onClickEvent(() => {
        //    this.activateView(COLLABORATION_VIEW_TYPE); // Open the main control panel
        //});
        //statusBarItemEl.addClass('collaboration-status-bar-item');
        // --- END ACTIVE ---


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


        this.addSettingTab(new PluginSettingsTab(this.app, this));

        // --- MODIFIED: Activate the Collaboration Panel AFTER layout is ready ---
        // This ensures the panel is opened when Obsidian itself finishes loading its layout.
        //this.app.workspace.onLayoutReady(() => {
        //    this.activateView(COLLABORATION_VIEW_TYPE);
        // });
        // --- END MODIFIED ---
    }

    onunload() {
        new Notice('Plugin is unloading!');

        // Detach all custom views when the plugin unloads
        this.app.workspace.detachLeavesOfType(COLLABORATION_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(KEY_LIST_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(LINK_NOTE_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(PERSONAL_NOTES_VIEW_TYPE); // NEW: Detach PersonalNotesView

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
        // Removed: old personalComments property loading
        // this.personalComments = this.settings.personalComments;
    }

    async saveSettings() {
        // Save all settings, including linkedKeys and personalNotes
        await this.saveData(this.settings);
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
        console.log(`[ActivateView] Attempting to activate view: ${viewType}`);
        const { workspace } = this.app;
        let targetLeaf: WorkspaceLeaf | null = null;

        // Helper to check if a leaf is in the right sidebar
        const isLeafInRightSidebar = (leaf: WorkspaceLeaf): boolean => {
            if (!leaf || !workspace.rightSplit) return false;
            // Check if the leaf's direct parent or its parent's parent is the rightSplit
            // This covers leaves directly in the sidebar or within a tab group in the sidebar.
            return (leaf.parent instanceof WorkspaceSidedock && leaf.parent === workspace.rightSplit) ||
                   (leaf.parent?.parent instanceof WorkspaceSidedock && leaf.parent?.parent === workspace.rightSplit);
        };

        // 1. Check if the active leaf is already the target view type and in the right sidebar
        //    This means we don't need to do anything, it's already visible.
        if (workspace.activeLeaf &&
            workspace.activeLeaf.view.getViewType() === viewType &&
            isLeafInRightSidebar(workspace.activeLeaf)) {
            console.log(`[ActivateView] Target view (${viewType}) is already active in the right sidebar.`);
            return; // Already where we want to be.
        }

        // 2. Try to find an existing leaf of this viewType in the right sidebar to reuse.
        const allLeavesOfViewType = workspace.getLeavesOfType(viewType);
        for (const l of allLeavesOfViewType) {
            const isPopout = !!l.view?.containerEl?.closest('.mod-popout-window');
            if (!isPopout && isLeafInRightSidebar(l)) {
                targetLeaf = l;
                console.log(`[ActivateView] Found existing leaf of type ${viewType} in right sidebar. Reusing it.`);
                break;
            }
        }

        // 3. If no suitable existing leaf was found, try to reuse the current active leaf
        //    IF it's in the right sidebar. This ensures the current sidebar tab gets replaced.
        if (!targetLeaf && workspace.activeLeaf && isLeafInRightSidebar(workspace.activeLeaf)) {
            targetLeaf = workspace.activeLeaf;
            console.log(`[ActivateView] Reusing active leaf in right sidebar for view type: ${viewType}`);
        }
        
        // 4. If still no leaf, get a new leaf specifically for the right sidebar.
        //    getRightLeaf(true) will create it if it doesn't exist and ensures it's in the right sidebar.
        if (!targetLeaf) {
            console.log(`[ActivateView] No suitable leaf found or reused. Getting a new leaf for the right sidebar for view type: ${viewType}`);
            targetLeaf = workspace.getRightLeaf(false);
        }

        // 5. Final check and set view state
        if (targetLeaf) {
            console.log(`[ActivateView] Setting view state for leaf. Parent: ${targetLeaf.parent?.constructor.name}`);
            await targetLeaf.setViewState({
                type: viewType,
                active: true, // Make this the active tab in its pane
            });
            workspace.revealLeaf(targetLeaf);
            console.log(`[ActivateView] View ${viewType} activated and revealed in right sidebar.`);
        } else {
            console.error(`[ActivateView] Failed to obtain or activate a leaf for view type: ${viewType}.`);
            new Notice(`Failed to open ${viewType} panel. Could not find or create a suitable pane.`, 6000);
        }
    }

}
