// src/main.ts
import {
    App,
    Plugin,
    PluginSettingTab,
    Setting,
    Notice,
    TFile,
    WorkspaceLeaf,
    WorkspaceSidedock,
    Editor,
    MarkdownView,
    MarkdownPostProcessorContext, // For post-processor
    setIcon, // For icons in post-processor
    Menu, // For editor menu and file menu
} from 'obsidian';
import { registerAddKeyCommand } from './utils/add_key_command';
import { registerDeleteKeyCommand } from './utils/delete_key_command';
import { KeyListModal } from './settings/key_list_page02';
import { LinkNoteModal } from './settings/link_note_page03';
import { generateKey, addKey } from './storage/keyManager';
import { registerNoteWithPeer, requestNoteFromPeer, sendNoteToHost } from './networking/socket/client';
import { PluginSettingsTab } from "./settings/plugin_setting_tab";
import { FileSystemAdapter } from "obsidian";
const { spawn } = require("child_process");
import * as path from "path";
import * as fs from "fs";
const noteRegistry = require("./networking/socket/dist/noteRegistry.cjs");
import * as http from "http";
import { tempKeyInputModal } from './settings/tempKeyInputModal';
import { tempIPInputModal } from './settings/tempIPInputModal';
import { getLocalIP } from './utils/get-ip';
import { registerGenerateKeyCommand } from './utils/generate_key_command';
import { registerPullNoteCommand, rewriteExistingNote } from './utils/pull_note_command';
import { registerStartServerCommand, startWebSocketServerProcess } from './utils/start_server_command';
import { registerShowIPCommand } from './utils/show_ip_command';
import { registerListSharedKeysCommand } from './utils/list_keys_command';
import { registerShareCurrentNoteCommand } from './utils/share_active_note'; // Existing, will add another command for stripping
import { registerSyncFromServerToSettings, syncRegistryFromServer } from './utils/sync_command';
import { registerUpdateRegistryCommand } from './utils/share_active_note';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs for personal notes

// --- MODIFIED IMPORTS for Personal Notes and Views:
import { COLLABORATION_VIEW_TYPE, KEY_LIST_VIEW_TYPE, LINK_NOTE_VIEW_TYPE, PERSONAL_NOTES_VIEW_TYPE } from './constants/viewTypes'; // NEW: Added PERSONAL_NOTES_VIEW_TYPE
import { CollaborationPanelView } from './views/CollaborationPanelView';
import { KeyListView } from './views/KeyListView';
import { LinkNoteView } from './views/LinkNoteView';
import { PersonalNotesView } from './views/PersonalNotesView'; 

// --- NEW IMPORTS FOR POST-PROCESSOR & UTILITIES:
import { registerPersonalNotePostProcessor } from './utils/pnpp';
import { stripPersonalNoteBlocks } from './utils/stripPersonalNotes';
import { updatePersonalNoteLocations } from './utils/updatePersonalNoteLocations'; // NEW: For robust line number tracking
// import { removePersonalNoteBlockFromFile } from './utils/removePersonalNoteBlockFromFile'; 
// --- END NEW IMPORTS ---

import { NoteManager } from "./networking/socket/NoteManager";
import { parseKey } from './utils/parse_key';
import { exec } from 'child_process';


export type NoteRegistry = Record<string, string>; // key => content

// --- PERSONAL NOTE INTERFACE (User's Version Retained - Optional Properties, but handled in loadSettings) ---
export interface PersonalNote {
    id: string;             // Unique ID (UUID) for the note object itself
    targetFilePath: string; // Full path to the Obsidian note file
    lineNumber: number;     // The 0-indexed line number in the target file where the marker is inserted
    title?: string;         // Optional user-defined title for the personal note (retained user's optionality)
    content: string;        // The actual content of the personal note (STORED ONLY IN PLUGIN SETTINGS)
    createdAt: number;      // Timestamp of creation (for sorting)
    updatedAt: number;      // Timestamp of last modification
    isExpanded?: boolean;   // UI state: for the embedded box (retained user's optionality)
}
// --- END PERSONAL NOTE INTERFACE ---


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
    personalNotes: PersonalNote[]; // Personal notes metadata + content
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: 'default',
    keys: [],
    linkedKeys: [],
    registry: [],
    autoUpdateRegistry: true,
    personalNotes: [], // Initialize as empty array for new PersonalNote interface
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

export function waitForWebSocketConnection(url: string, plugin: MyPlugin, retries = 15): void {
    let attempt = 0;
    let pingInterval: NodeJS.Timeout;
    const tryConnect = () => {
        if (plugin.relaySocket && plugin.relaySocket.readyState === WebSocket.OPEN) {
            console.log("[Plugin] Closing active socket before reconnecting");
            plugin.relaySocket.close();
        }
        
        const socket = new WebSocket(url);

        socket.onopen = () => {
            console.log("[Plugin] Connected to WebSocket server");
            plugin.relaySocket = socket;
        
            pingInterval = setInterval(() => {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: "ping" }));
                    console.log("[Plugin] Ping sent to WebSocket server");
                }
            }, 30000); // every 30 seconds
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

                    // Use the globally accessible noteManager
                    if (plugin.noteManager) {
                        await plugin.noteManager.handleIncomingPush(key, content);
                    } else {
                        console.error("[Plugin] NoteManager not initialized, cannot handle incoming push.");
                        new Notice("Error: NoteManager not ready to handle incoming note.", 4000);
                    }
                }
                if (msg.type === "pong") {
                    console.log("[Plugin] Pong received from server");
                }
                
            } catch (err) {
                console.error("[Plugin] Failed to parse incoming WebSocket message:", err);
            }
        };

        socket.onclose = () => {
            console.warn("[Plugin] WebSocket closed.");
            plugin.relaySocket = null;
            clearInterval(pingInterval);
        
            if (++attempt < retries) {
                console.log(`[Plugin] Reconnecting... Attempt ${attempt + 1}/${retries}`);
                setTimeout(tryConnect, 1000);
            } else {
                console.error("[Plugin] Gave up after too many reconnect attempts.");
            }
        };
                    };

    tryConnect();
}


export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    registry: noteRegistry[] = []; // This will be deprecated in favor of settings.registry

    autoRegistryUpdate: boolean = false; // Auto-update registry setting (retained user's default)
    personalNotes: PersonalNote[] = []; // Store personal notes metadata + content (retained user's direct declaration)
    relaySocket: WebSocket | null = null;

    // --- NEW: NoteManager instance as a class property ---
    // This is crucial for NoteManager to be accessible from various parts of the plugin
    // and to avoid creating new instances on every message.
    noteManager: NoteManager;
    // --- END NEW ---
    keys: { note: string; ip: string; view?: string }[] = [];

    private _debounceUpdateLocationsTimeout: NodeJS.Timeout | null = null; // For debouncing personal note location updates


    async onload() {
        console.log("Loading collaboration plugin...");
        await this.loadSettings();
        
        // --- NEW: Initialize NoteManager here ---
        // This ensures a single instance is available throughout the plugin's lifecycle.
        this.noteManager = new NoteManager(this, "ws://localhost:3010");
        // --- END NEW ---        
        // Sart WebSocket server
        startWebSocketServerProcess(this.app, this);
        waitForWebSocketConnection("ws://localhost:3010", this);

        // --- NEW: Update personal note locations on plugin load ---
        await updatePersonalNoteLocations(this);
        // --- END NEW ---

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
        registerSyncFromServerToSettings(this); // Added back sync command if missing

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

        // --- NEW: Share Current Note (Stripped of Personal Comments) Command ---
        this.addCommand({
            id: 'share-current-note-stripped',
            name: 'Share Current Note (Stripped of Personal Comments)',
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile) {
                    new Notice("No active file selected to share.", 3000);
                    return;
                }

                if (activeFile.extension !== 'md') {
                    new Notice("Only Markdown files can be shared.", 3000);
                    return;
                }

                try {
                    const originalContent = await this.app.vault.read(activeFile);
                    const strippedContent = stripPersonalNoteBlocks(originalContent);

                    const noteName = activeFile.basename;
                    
                    console.log(`[Share Note] Successfully stripped personal notes from "${activeFile.basename}".`);
                    console.log("--- STRIPPED CONTENT READY TO SEND ---");
                    console.log(strippedContent);
                    console.log("-------------------------------------");
                    new Notice(`"${activeFile.basename}" stripped of personal notes and logged to console. Ready to be sent.`);

                    // Example: To actually send, you would need targetIp and accessLevel
                    // For now, it logs the stripped content.
                    // This is where you might prompt the user for target IP and access type if you don't have it.
                    // Example (if you had a predefined target IP and access):
                    // await this.noteManager.sendNote(noteName, strippedContent, "View", "localhost"); 

                } catch (error) {
                    console.error("[Share Note] Error sharing note:", error);
                    new Notice("Failed to prepare note for sharing. Check console for details.", 4000);
                }
            }
        });
        // --- END NEW: Share Current Note Command ---


        this.addCommand({
            id: "test-strip-personal-notes",
            name: "Test: Strip Personal Notes (Log Output)",
            callback: async () => {
                const file = this.app.workspace.getActiveFile();
                if (!file) {
                    new Notice("No active file selected.");
                    return;
                }
                const raw = await this.app.vault.read(file);
                const cleaned = stripPersonalNoteBlocks(raw);
                console.log("=== Stripped Content ===\n", cleaned);
                new Notice("Stripped content logged to console.");
            },
        });
        this.addCommand({
            id: "restore-personal-notes-to-files",
            name: "Restore Personal Notes to Files",
            callback: async () => {
                await this.restorePersonalNotesIntoFiles();
            },
        });
            
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
        // --- NEW: Register the Personal Notes Panel View ---
        this.registerView(
            PERSONAL_NOTES_VIEW_TYPE,
            (leaf) => new PersonalNotesView(leaf, this)
        );
        // --- END NEW ---


        this.addCommand({
            id: "manually start websocket",
            name: "Manually start websocket",
            callback: async () => {
                const ip = "localhost";
                const key = "TestNote"; // Replace with your test note name (without `.md`)
                waitForWebSocketConnection("ws://localhost:3010", this);
            }
        });
        
        // Ribbon icon to open your Collaboration Panel
        this.addRibbonIcon('columns-3', 'Open Collaboration Panel', () => {
            console.log("Ribbon icon clicked! Calling activateView for Collaboration Panel")
            this.activateView(COLLABORATION_VIEW_TYPE); // Open the main control panel
        });

        // --- NEW: Ribbon icon to open Personal Notes Panel ---
        this.addRibbonIcon('file-user', 'Open Personal Notes Panel', () => {
            console.log("Ribbon icon clicked! Calling activateView for Personal Notes Panel");
            this.activateView(PERSONAL_NOTES_VIEW_TYPE);
        });
        // --- END NEW ---


        this.addRibbonIcon('file-plus-2', 'Create Private Personal Note (In-Note)', async () => {
            const activeFile = this.app.workspace.getActiveFile();
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

            if (!activeFile) {
                new Notice("Please open a note to create an in-note personal note.", 3000);
                return;
            }

            if (!activeView) {
                new Notice("No active Markdown editor found. Please focus on a note.", 3000);
                return;
            }

            const editor = activeView.editor;
            const cursor = editor.getCursor();
            const lineNumber = cursor.line;
            // --- MODIFIED: Default content is now an empty string ---
            const defaultContent = ""; // This will be handled by placeholder in pnpp.ts
            // --- MODIFIED: Dynamic default title based on file name ---
            const defaultTitle = `${activeFile.basename} - Personal Note`; 
            const noteId = uuidv4(); // Generate a unique ID

            const personalNoteMarker =
                `\`\`\`personal-note\n` +
                `id:${noteId}\n` +
                `${defaultContent}\n` + // Content is now empty, pnpp.ts will show placeholder
                `\`\`\`\n`;

            // Insert the marker into the editor at the cursor position
            editor.replaceRange(personalNoteMarker, cursor);

            // Add the FULL personal note (including its content) to plugin settings
            const newPersonalNote: PersonalNote = {
                id: noteId,
                targetFilePath: activeFile.path,
                lineNumber: lineNumber,
                title: defaultTitle, // Use the new dynamic default title
                content: defaultContent, // Stored as empty string
                createdAt: Date.now(),
                updatedAt: Date.now(),
                isExpanded: true,
            };

            this.settings.personalNotes.push(newPersonalNote);
            await this.saveSettings();
            new Notice(`Private personal note box created: "${newPersonalNote.title}".`, 3000);

            // Optionally, place cursor inside the new block for immediate editing (after the lang identifier and ID line)
            editor.setCursor(lineNumber + 2, 0); // +2 for lang identifier and ID line
        });

        // --- Register Markdown Post Processor for rendering personal notes in Reading View
        registerPersonalNotePostProcessor(this);
        // --- END NEW ---

        // --- NEW: Listen for file changes to update personal note locations (Debounced) ---
        // This replaces the updateLineCount logic and is more robust for personal notes.
        this.registerEvent(this.app.vault.on('modify', async (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                if (this._debounceUpdateLocationsTimeout) {
                    clearTimeout(this._debounceUpdateLocationsTimeout);
                }
                this._debounceUpdateLocationsTimeout = setTimeout(async () => {
                    console.log(`[Personal Notes] File modified: ${file.path}. Checking for personal note location updates.`);
                    await updatePersonalNoteLocations(this, file.path); // Use the dedicated utility
                    // Trigger a general update event to ensure views/post-processors refresh
                    (this.app.workspace as any).trigger('plugin:personal-notes-updated');
                }, 1000); // Debounce by 1 second
            }
        }));
        // --- END NEW ---

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
        this.app.workspace.onLayoutReady(() => {
            // this.activateView(COLLABORATION_VIEW_TYPE); // Uncomment if you want to activate on layout ready
        });
        // --- END MODIFIED ---
        
        this.keys = (await this.loadData())?.keys || [];
        console.log('[Plugin] Loaded keys:', this.keys);

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (!(file instanceof TFile)) return;

                const pulledKey = this.settings.linkedKeys.find(k => k.note === file.basename);

                if (!pulledKey) return; // Not pulled → skip

                menu.addItem(item =>
                item.setTitle('Pull Changes')
                    .setIcon('book-down')
                    .onClick(() => {
                    const parseInput = `${pulledKey.ip}-${pulledKey.note}|${pulledKey.access}`;
                    const parsedKeyInfo = parseKey(parseInput);

                    if (!parsedKeyInfo?.ip || !parsedKeyInfo?.noteName) {
                        new Notice("Invalid key format.", 4000);
                        return;
                    }

                    rewriteExistingNote(this.app, parsedKeyInfo.ip, parsedKeyInfo.noteName, this);
                    new Notice(`Requested latest changes for "${parsedKeyInfo.noteName}".`);
                    })
                );

                menu.addItem(item =>
                item.setTitle('Push Changes')
                    .setIcon('book-up')
                    .onClick(async () => {
                    const parseInput = `${pulledKey.ip}-${pulledKey.note}|${pulledKey.access}`;
                    const parsedKeyInfo = parseKey(parseInput);

                    if (!parsedKeyInfo?.ip || !parsedKeyInfo?.noteName) {
                        new Notice("Invalid key format.", 4000);
                        return;
                    }

                    const content = await this.app.vault.read(file);
                    const { sendNoteToHost } = await import("./networking/socket/client");
                    sendNoteToHost(parsedKeyInfo.ip, parsedKeyInfo.noteName, content);

                    new Notice(`Pushed changes for '${parsedKeyInfo.noteName}' to ${parsedKeyInfo.ip}`, 3000);
                    })
            );
        })
    );
    }

    onunload() {
        new Notice('Plugin is unloading!');
        if (this._debounceUpdateLocationsTimeout) {
            clearTimeout(this._debounceUpdateLocationsTimeout);
        }

        // Detach all custom views when the plugin unloads
        this.app.workspace.detachLeavesOfType(COLLABORATION_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(KEY_LIST_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(LINK_NOTE_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(PERSONAL_NOTES_VIEW_TYPE); // NEW: Detach Personal Notes Panel View

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
        
        // --- NEW: Initialize isExpanded and handle optional title/content for existing personal notes ---
        if (!this.settings.personalNotes) {
            this.settings.personalNotes = [];
        } else {
            this.settings.personalNotes.forEach(note => {
                if (typeof note.isExpanded === 'undefined') {
                    note.isExpanded = false; // Default to collapsed for existing notes
                }
                // Ensure title is a string, even if optional in interface, for UI consistency
                if (typeof note.title === 'undefined' || note.title === null || note.title === '') {
                    note.title = `Personal Note on ${note.targetFilePath.split('/').pop()?.replace(/\.md$/, '') || 'Unknown File'} (Line ${note.lineNumber + 1})`;
                }
                // Handle old default content to ensure new placeholder works
                if (note.content === "Write your personal comments here. This box will appear whenever the link is clicked") {
                    note.content = ""; // Clear old default content if it matches the legacy prompt
                }
            });
        }
        // --- END NEW ---
        this.registry = this.settings.registry;
    }

    async saveSettings() {
        // Save all settings, including linkedKeys and personalNotes
        await this.saveData(this.settings);
        // --- NEW: Trigger a general update event after saving settings ---
        // This is crucial for any views/post-processors that need to re-render
        // when settings (like personal note content/state) change.
        (this.app.workspace as any).trigger('plugin:personal-notes-updated');
        // --- END NEW ---
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
        //    getRightLeaf(true) will create it if it's doesn't exist and ensures it's in the right sidebar.
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

    // --- MODIFIED: restorePersonalNotesIntoFiles to be vault-wide and strip existing blocks ---
    // This version is more robust, handling all personal notes across the vault
    // and stripping existing blocks before re-inserting, which is crucial if notes are pulled.
    async restorePersonalNotesIntoFiles(): Promise<void> {
        const notesByFile: Record<string, PersonalNote[]> = {};
        for (const pn of this.settings.personalNotes) {
            if (!notesByFile[pn.targetFilePath]) {
                notesByFile[pn.targetFilePath] = [];
            }
            notesByFile[pn.targetFilePath].push(pn);
        }

        let restoredCount = 0;
        for (const filePath of Object.keys(notesByFile)) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) {
                // Only warn if the file should exist based on personal notes data
                if (notesByFile[filePath].length > 0) {
                     console.warn(`[Personal Notes] Cannot restore: File "${filePath}" not found in vault.`);
                }
                continue;
            }

            let content = await this.app.vault.read(file);
            // First, strip any existing personal note blocks to prevent duplicates
            // This is crucial if the note was updated/pulled from a peer who doesn't have the blocks.
            content = stripPersonalNoteBlocks(content); 

            const lines = content.split('\n');
            const personalNotesForFile = notesByFile[filePath];
            
            // Sort notes by line number in descending order to insert from bottom up
            // This prevents line numbers from shifting as we add new content
            personalNotesForFile.sort((a, b) => b.lineNumber - a.lineNumber);

            for (const note of personalNotesForFile) {
                const markerBlock = [
                    '```personal-note',
                    `id:${note.id}`,
                    note.content,
                    '```'
                ].join('\n');
                
                // Ensure the line number is valid, or insert at the end
                const targetLine = Math.min(note.lineNumber, lines.length);
                lines.splice(targetLine, 0, markerBlock);
                restoredCount++;
            }
            const updatedContent = lines.join('\n');
            await this.app.vault.modify(file, updatedContent);
        }
        if (restoredCount > 0) {
            new Notice(`Restored ${restoredCount} personal notes across your vault.`);
        } else {
            new Notice("No personal notes needed restoring to files.");
        }
    }
}
