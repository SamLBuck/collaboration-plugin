// src/networking/socket/NoteManager.ts

import { App, TFile, Notice, Modal, MarkdownView } from "obsidian";
import { updateNoteRegistry, deleteNoteFromRegistry } from "../../storage/registryStore";
import { requestNoteFromPeer, registerNoteWithPeer } from "./client";

import type MyPlugin from "../../main"; // Import the plugin type for type checking
import { PullConfirmationModal } from "../../settings/pull_confirmation_modal"; // Assuming you use this elsewhere for pulls
import { ReceivedPushConfirmation } from "../../settings/ReceivedPushConfirmation";
import { stripPersonalNoteBlocks } from "../../utils/stripPersonalNotes";


export class NoteManager {
    private plugin: MyPlugin;
    private serverUrl: string;

    constructor(plugin: MyPlugin, serverUrl: string) {
        this.plugin = plugin;
        this.serverUrl = serverUrl;
    }

    async shareNote(key: string, content: string): Promise<void> {
        registerNoteWithPeer(this.serverUrl, key, content);
        await updateNoteRegistry(this.plugin, key, content);
    }

    async pullNote(key: string): Promise<string> {
        const content = await requestNoteFromPeer(this.serverUrl, key);
        await updateNoteRegistry(this.plugin, key, content);
        // After pulling and updating registry, trigger personal notes restore
        // You can choose to call either:
        // await this.plugin.restorePersonalNotesIntoFiles(); // Recommended: Master Coordinator in main.ts
        // OR:
        await this.restorePersonalNotesIntoActiveFileNoteManager(); // Local Assistant in NoteManager.ts (only if active file is the target)
        new Notice(`Note '${key}' pulled and opened successfully.`, 3000);
        return content;
    }

    async removeNote(key: string): Promise<void> {
        await deleteNoteFromRegistry(this.plugin, key);
    }

    async handleIncomingPush(key: string, content: string) {
        const filePath = `${key}.md`;
        let file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        let overwrite = false;
        let currentContent = "";
        let editedContent = content; // Initialize editedContent with the incoming content

        if (file && file instanceof TFile) {
            currentContent = await this.plugin.app.vault.read(file);
        }
        
        // Strip personal note blocks from both current and incoming content before diffing/confirming
        // This ensures the user sees the "clean" note content in the modal
        const strippedCurrentContent = stripPersonalNoteBlocks(currentContent);
        const strippedIncomingContent = stripPersonalNoteBlocks(content); // Use stripped content for the modal preview

        overwrite = await new Promise<boolean>((resolve) => {
            new ReceivedPushConfirmation(
                this.plugin.app,
                `Note "${filePath}" already exists. Overwrite it?`,
                strippedCurrentContent, // Pass stripped content of current file
                strippedIncomingContent, // Pass stripped content of incoming
                (confirmed: boolean, userEditedContent?: string) => { // userEditedContent will be the result from the modal
                    if (confirmed && userEditedContent !== undefined) {
                        editedContent = userEditedContent; // Use content from modal if user edited it
                    }
                    resolve(confirmed);
                }
            ).open();
        });
            
        if (!overwrite) {
            new Notice(`Push cancelled for "${filePath}".`, 3000);
            return;
        }
    
        if (file && file instanceof TFile) {
            await this.plugin.app.vault.modify(file, editedContent); // Write the (possibly edited) incoming content
        } else {
            file = await this.plugin.app.vault.create(filePath, editedContent); // Create the file if it doesn't exist
        }
    
        // Optionally open the file if it's not already active
        if (file instanceof TFile) {
            const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (!activeView || activeView.file?.path !== file.path) {
                await this.plugin.app.workspace.getLeaf(true).openFile(file);
            }
            new Notice(`Note '${key}' pushed and updated successfully.`, 3000);
        }
    
        await updateNoteRegistry(this.plugin, key, content);

        // === CRUCIAL STEP: After the file has been modified/created, restore personal notes ===
        // RECOMMENDED: Call the more robust, vault-wide restore from the main plugin instance
        await this.plugin.restorePersonalNotesIntoFiles(); 
        console.log(`[NoteManager] Called restorePersonalNotesIntoFiles() (from main.ts) after push for '${filePath}'.`);

        // IF YOU ABSOLUTELY WANT TO USE THE LOCAL ONE:
        // You would uncomment the line below and comment out the one above.
        // await this.restorePersonalNotesIntoActiveFileNoteManager();
        // console.log(`[NoteManager] Called restorePersonalNotesIntoActiveFileNoteManager() after push for '${filePath}'.`);

        // Trigger a global event to inform all personal note UI components (like the inline blocks) to refresh
        (this.plugin.app.workspace as any).trigger('plugin:personal-notes-updated');

        // Force editor update for the currently active file if it matches
        if (file instanceof TFile) {
            const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file?.path === file.path && activeView.editor) {
                const editor = activeView.editor;
                const originalCursor = editor.getCursor();
                // Setting the value to its current value often triggers a re-render
                editor.setValue(editor.getValue()); 
                editor.setCursor(originalCursor); // Attempt to restore cursor position
            }
        }
    }

    /**
     * Restores personal note blocks into the *currently active* file.
     * This method is less robust than `plugin.restorePersonalNotesIntoFiles()` as it
     * does not strip existing personal note blocks from the content before inserting.
     * Use with caution or if you have specific reasons for this limited scope.
     */
    async restorePersonalNotesIntoActiveFileNoteManager() {
        console.log("[NoteManager] restorePersonalNotesIntoActiveFileNoteManager() called.");
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice("No active file open to restore personal notes into.");
            console.warn("[NoteManager] No active file for restorePersonalNotesIntoActiveFileNoteManager.");
            return;
        }
    
        const filePath = activeFile.path;
        // Filter personal notes that belong to the active file
        const personalNotes = this.plugin.settings.personalNotes.filter(pn => pn.targetFilePath === filePath);
    
        if (personalNotes.length === 0) {
            new Notice(`No personal notes found in settings for "${filePath}".`);
            console.log(`[NoteManager] No personal notes found in settings for active file "${filePath}".`);
            return;
        }
    
        let content = await this.plugin.app.vault.read(activeFile);
        const lines = content.split('\n');
        
        // Sort notes by line number in descending order for safe insertion
        personalNotes.sort((a, b) => b.lineNumber - a.lineNumber);
        console.log(`[NoteManager] Found ${personalNotes.length} personal notes for active file. Sorted for insertion.`);
    
        for (const note of personalNotes) {
            const markerBlock = [
                '```personal-note',
                `id:${note.id}`,
                note.content,
                '```'
            ].join('\n');
            
            // Ensure targetLine is valid, inserting at the end if out of bounds
            const targetLine = Math.min(note.lineNumber, lines.length);
            lines.splice(targetLine, 0, markerBlock);
            console.log(`[NoteManager] Inserted personal note ID ${note.id.substring(0,8)}... at line ${targetLine}.`);
        }
    
        const updatedContent = lines.join('\n');
        
        // Update the editor if the file is open and active, otherwise modify the vault file
        const editor = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
        if (editor && editor.getValue() !== updatedContent) { // Only update if content is different
            editor.setValue(updatedContent);
            new Notice(`Inserted ${personalNotes.length} personal notes into "${filePath}".`);
            console.log(`[NoteManager] Editor updated for "${filePath}" with personal notes.`);
        } else if (!editor) {
            await this.plugin.app.vault.modify(activeFile, updatedContent);
            new Notice(`Updated "${filePath}" with personal notes (no editor open).`);
            console.log(`[NoteManager] Vault file "${filePath}" modified with personal notes (editor not active).`);
        } else {
            console.log(`[NoteManager] No change detected for active file "${filePath}" or editor not found.`);
        }
    }
}
