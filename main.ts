// main.ts
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
} from 'obsidian';
import { registerAddKeyCommand } from './utils/add_key_command';
import { registerDeleteKeyCommand } from './utils/delete_key_command';
import { KeyListModal } from './settings/key_list_page02';
import { LinkNoteModal } from './settings/link_note_page03'; // Corrected path/import
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
import { registerPullNoteCommand } from './utils/pull_note_command';
import { registerStartServerCommand, startWebSocketServerProcess } from './utils/start_server_command';
import { registerShowIPCommand } from './utils/show_ip_command';
import { registerListSharedKeysCommand } from './utils/list_keys_command';
import { registerShareCurrentNoteCommand } from './utils/share_active_note';
import { registerSyncFromServerToSettings, syncRegistryFromServer } from './utils/sync_command';
import { registerUpdateRegistryCommand } from './utils/share_active_note';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs for personal notes

// --- MODIFIED IMPORTS:
import { COLLABORATION_VIEW_TYPE, KEY_LIST_VIEW_TYPE, LINK_NOTE_VIEW_TYPE } from './constants/viewTypes';
import { CollaborationPanelView } from './views/CollaborationPanelView';
import { KeyListView } from './views/KeyListView';
import { LinkNoteView } from './views/LinkNoteView';
import { PersonalNoteEditModal } from './settings/PersonalNoteEditModal'; // Import the Edit Modal

// --- NEW IMPORT FOR POST-PROCESSOR:
import { registerPersonalNotePostProcessor } from './utils/pnpp';
// --- END NEW IMPORT ---

// --- END MODIFIED IMPORTS ---
import { NoteManager } from "./networking/socket/NoteManager";
import { stripPersonalNoteBlocks } from './utils/stripPersonalNotes';


export type NoteRegistry = Record<string, string>; // key => content

// --- MODIFIED: PersonalNote Interface ---
export interface PersonalNote {
    id: string;             // Unique ID (UUID) for the note object itself
    targetFilePath: string; // Full path to the Obsidian note file
    lineNumber: number;     // The 0-indexed line number in the target file where the marker is inserted
    title?: string;         // Optional user-defined title for the personal note
    content: string;        // The actual content of the personal note (STORED ONLY IN PLUGIN SETTINGS)
    createdAt: number;      // Timestamp of creation (for sorting)
    updatedAt: number;      // Timestamp of last modification
    isExpanded?: boolean;   // UI state: for the embedded box (if implemented)
}
// --- END MODIFIED ---


export interface KeyItem {
    //content: any;
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

                    const noteManager = new NoteManager(plugin, "ws://localhost:3010");
                    await noteManager.handleIncomingPush(key, content);
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

    autoRegistryUpdate: boolean = false; // Auto-update registry setting
    personalNotes: PersonalNote[] = []; // Store personal notes metadata + content
    relaySocket: WebSocket | null = null;


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
        this.addRibbonIcon('share', 'Open Collaboration Panel', () => {
            console.log("Ribbon icon clicked! Calling activateView for Collaboration Panel")
            this.activateView(COLLABORATION_VIEW_TYPE); // Open the main control panel
        });

this.addRibbonIcon('sticky-note', 'Create Private Personal Note (In-Note)', async () => {
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
    const defaultContent = "Type your private note here...";
    const noteId = uuidv4(); // Generate a unique ID

    const personalNoteMarker =
        `\`\`\`personal-note\n` +           // Fixed language identifier
        `id:${noteId}\n` +                   // UUID on its own line inside the block
        `${defaultContent}\n` +              // Actual content below the ID
        `\`\`\`\n`;

    // Insert the marker into the editor at the cursor position
    editor.replaceRange(personalNoteMarker, cursor);

    // Add the FULL personal note (including its content) to plugin settings
    const newPersonalNote: PersonalNote = {
        id: noteId,
        targetFilePath: activeFile.path,
        lineNumber: lineNumber,
        title: `Private Note on ${activeFile.basename} (Line ${lineNumber + 1})`,
        content: defaultContent,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isExpanded: true,
    };

    this.settings.personalNotes.push(newPersonalNote);
    await this.saveSettings();
    new Notice(`Private personal note box created for "${activeFile.basename}" at line ${lineNumber + 1}.`, 3000);

    // Optionally, place cursor inside the new block for immediate editing (after the lang identifier and ID line)
    editor.setCursor(lineNumber + 2, 0); // +2 for lang identifier and ID line

    
});

        // --- NEW: Register Markdown Post Processor for rendering personal notes in Reading View
        // The previous post-processor code you had was inline. I'm moving it to a separate file
        // and calling the registration function here for better organization.
        registerPersonalNotePostProcessor(this);
        // --- END NEW ---


        // --- ACTIVE: Original StatusBar Item ---
        //const statusBarItemEl = this.addStatusBarItem();
        //statusBarItemEl.setText('Control Panel');
        //statusBarItemEl.onClickEvent(() => {
        //   this.activateView(COLLABORATION_VIEW_TYPE); // Open the main control panel
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
        //   this.activateView(COLLABORATION_VIEW_TYPE);
        // });
        // --- END MODIFIED ---
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
        // --- NEW: Initialize isExpanded for existing personal notes ---
        if (!this.settings.personalNotes) {
            this.settings.personalNotes = [];
        } else {
            this.settings.personalNotes.forEach(note => {
                if (typeof note.isExpanded === 'undefined') {
                    note.isExpanded = false; // Default to collapsed for existing notes
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
        // This can be useful for any views that need a full refresh (like your PersonalNotesView)
        // or for any inline notes to re-render if their content or state changed externally.
        // However, for inline notes, the specific event with noteId is more efficient.
        // You can keep this general trigger if other parts of your plugin rely on it.
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
    async restorePersonalNotesIntoFiles() {
        const notesByFile: Record<string, PersonalNote[]> = {};
    
        // Group personal notes by file path
        for (const pn of this.settings.personalNotes) {
            if (!notesByFile[pn.targetFilePath]) {
                notesByFile[pn.targetFilePath] = [];
            }
            notesByFile[pn.targetFilePath].push(pn);
        }
    
        for (const filePath of Object.keys(notesByFile)) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) {
                new Notice(`File "${filePath}" not found in vault.`);
                continue;
            }
    
            let content = await this.app.vault.read(file);
            const lines = content.split('\n');
            const personalNotes = notesByFile[filePath];
    
            // Sort notes in reverse order by line number so line insertions don't shift subsequent positions
            personalNotes.sort((a, b) => b.lineNumber - a.lineNumber);
    
            for (const note of personalNotes) {
                const markerBlock = [
                    '```personal-note',
                    `id:${note.id}`,
                    note.content,
                    '```'
                ].join('\n');
    
                // Insert the marker at the correct line
                lines.splice(note.lineNumber, 0, markerBlock);
            }
    
            const updatedContent = lines.join('\n');
            await this.app.vault.modify(file, updatedContent);
            new Notice(`Restored ${personalNotes.length} personal notes to "${filePath}".`);
        }
    }
    
}