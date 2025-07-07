// src/utils/updatePersonalNoteLocations.ts

import { TFile, Notice } from 'obsidian';
import MyPlugin from '../main'; // Ensure correct import path

/**
 * Scans Obsidian notes to update the stored line numbers of personal note blocks.
 * This is crucial for keeping the registry accurate if notes are moved or lines are added/removed above them.
 * @param plugin The main plugin instance.
 * @param filePath Optional: Path to a specific file to scan. If omitted, all Markdown files are scanned.
 */
export async function updatePersonalNoteLocations(plugin: MyPlugin, filePath?: string): Promise<void> {
    console.log(`[Personal Notes] Starting location update for ${filePath || 'all Markdown files'}.`);
    let settingsUpdated = false;

    // Filter notes if a specific filePath is provided, otherwise process all personal notes
    const notesToScan = filePath
        ? plugin.settings.personalNotes.filter(note => note.targetFilePath === filePath)
        : [...plugin.settings.personalNotes];

    // Group personal notes by file path for efficient processing
    const notesByFile: Map<string, PersonalNote[]> = new Map();
    for (const note of notesToScan) {
        if (!notesByFile.has(note.targetFilePath)) {
            notesByFile.set(note.targetFilePath, []);
        }
        notesByFile.get(note.targetFilePath)?.push(note);
    }

    // Iterate through each file that contains personal notes
    for (const [path, notesInFile] of notesByFile.entries()) {
        const file = plugin.app.vault.getAbstractFileByPath(path);
        // Skip if the file is not found or is not a Markdown file
        if (!(file instanceof TFile) || file.extension !== 'md') {
            console.warn(`[Personal Notes] Skipped scanning non-Markdown file or invalid path: ${path}`);
            continue;
        }

        try {
            const content = await plugin.app.vault.read(file); // Read the file content
            const lines = content.split('\n'); // Split content into individual lines
            
            // Regex to identify the start of a personal note block (e.g., ```personal-note)
            const blockStartRegex = /^```personal-note$/;
            // Regex to extract the ID from the line directly following the block start (e.g., id:YOUR-UUID)
            const idLineRegex = /^\s*id:([a-f0-9-]+)\s*$/i; 

            // Iterate through each line of the file to find personal note blocks
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Check if the current line marks the start of a personal note block
                if (blockStartRegex.test(line.trim())) {
                    // Ensure there's a next line to check for the ID
                    if (i + 1 < lines.length) {
                        const idLine = lines[i + 1].trim(); // Get the next line
                        const idMatch = idLine.match(idLineRegex); // Try to match the ID pattern

                        // If an ID is found
                        if (idMatch && idMatch[1]) {
                            const foundId = idMatch[1];
                            // Find the corresponding personal note in the plugin's settings
                            const noteInSettings = plugin.settings.personalNotes.find(
                                (n) => n.id === foundId && n.targetFilePath === path
                            );

                            if (noteInSettings) {
                                // If the line number stored in settings is different from the current line
                                if (noteInSettings.lineNumber !== i) {
                                    console.log(`[Personal Notes] Updating line for ID ${foundId}: from ${noteInSettings.lineNumber} to ${i} in file ${file.basename}`);
                                    noteInSettings.lineNumber = i; // Update the line number
                                    noteInSettings.updatedAt = Date.now(); // Update timestamp
                                    settingsUpdated = true; // Mark that settings need saving
                                }
                            } else {
                                // Log a warning if a block is found in a file but not in settings
                                console.warn(`[Personal Notes] Found personal note block in ${file.basename} (ID: ${foundId}, Line: ${i}), but no matching entry in plugin settings. Consider creating a new personal note or clearing old data.`);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            // Log and notify if there's an error reading a file
            console.error(`[Personal Notes] Error reading file ${path} for location update:`, error);
            new Notice(`Error updating personal note locations in ${file.basename}. Check console.`, 4000);
        }
    }

    // Save settings only if any personal note's location was updated
    if (settingsUpdated) {
        await plugin.saveSettings();
        console.log("[Personal Notes] Personal note locations updated and settings saved.");
    } else {
        console.log("[Personal Notes] No personal note locations needed updating.");
    }
}
