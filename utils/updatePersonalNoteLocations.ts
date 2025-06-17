// src/utils/updatePersonalNoteLocations.ts

import { TFile, Notice } from 'obsidian';
import MyPlugin from '../main'; // Import your main plugin class
import { PersonalNote } from '../main'; // Import the PersonalNote interface

/**
 * Scans Obsidian notes to update the stored line numbers of personal note blocks.
 * This is crucial for keeping the registry accurate if notes are moved or lines are added/removed above them.
 * @param plugin The main plugin instance.
 * @param filePath Optional: Path to a specific file to scan. If omitted, all Markdown files are scanned.
 */
export async function updatePersonalNoteLocations(plugin: MyPlugin, filePath?: string): Promise<void> {
    console.log(`[Personal Notes] Starting location update for ${filePath || 'all Markdown files'}.`);
    let settingsUpdated = false;

    // Filter personal notes to only those potentially affected by the scan.
    // If filePath is provided, only check notes from that file. Otherwise, check all.
    const notesToScan = filePath
        ? plugin.settings.personalNotes.filter(note => note.targetFilePath === filePath)
        : [...plugin.settings.personalNotes]; // Create a shallow copy to iterate

    // Group notes by file path to avoid reading the same file multiple times
    const notesByFile: Map<string, PersonalNote[]> = new Map();
    for (const note of notesToScan) {
        if (!notesByFile.has(note.targetFilePath)) {
            notesByFile.set(note.targetFilePath, []);
        }
        notesByFile.get(note.targetFilePath)?.push(note);
    }

    for (const [path, notesInFile] of notesByFile.entries()) {
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile) || file.extension !== 'md') {
            console.warn(`[Personal Notes] Skipped scanning non-Markdown file or invalid path: ${path}`);
            continue;
        }

        try {
            const content = await plugin.app.vault.read(file);
            const lines = content.split('\n');
            
            // Regex to find the personal note marker line (e.g., "```personal-note")
            const blockStartRegex = /^```personal-note$/;
            // Regex to find the ID line (e.g., "id:UUID")
            const idLineRegex = /^\s*id:([a-f0-9-]+)\s*$/i; 

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Check if this line is the start of a personal note block
                if (blockStartRegex.test(line.trim())) {
                    // The very next line should be the ID line
                    if (i + 1 < lines.length) {
                        const idLine = lines[i + 1].trim();
                        const idMatch = idLine.match(idLineRegex);

                        if (idMatch && idMatch[1]) {
                            const foundId = idMatch[1];
                            // Find the corresponding personal note object in settings
                            const noteInSettings = plugin.settings.personalNotes.find(
                                (n) => n.id === foundId && n.targetFilePath === path
                            );

                            if (noteInSettings) {
                                // The line number of the marker itself is 'i' (0-indexed).
                                // If the stored lineNumber is different, update it.
                                if (noteInSettings.lineNumber !== i) {
                                    console.log(`[Personal Notes] Updating line for ID ${foundId}: from ${noteInSettings.lineNumber} to ${i} in file ${file.basename}`);
                                    noteInSettings.lineNumber = i;
                                    noteInSettings.updatedAt = Date.now(); // Mark as updated
                                    settingsUpdated = true;
                                }
                            } else {
                                console.warn(`[Personal Notes] Found personal note block in ${file.basename} (ID: ${foundId}, Line: ${i}), but no matching entry in plugin settings. Consider creating a new personal note or clearing old data.`);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`[Personal Notes] Error reading file ${path} for location update:`, error);
            new Notice(`Error updating personal note locations in ${file.basename}. Check console.`, 4000);
        }
    }

    if (settingsUpdated) {
        await plugin.saveSettings();
        console.log("[Personal Notes] Personal note locations updated and settings saved.");
    } else {
        console.log("[Personal Notes] No personal note locations needed updating.");
    }
}
