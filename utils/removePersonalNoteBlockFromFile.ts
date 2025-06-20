// utils/removePersonalNoteBlockFromFile.ts

import { App, TFile, Notice } from 'obsidian';

/**
 * Removes a specific personal note Markdown block from a TFile based on its unique ID.
 * This function scans the file content, identifies the block by `id:UUID`, and removes it.
 *
 * @param app The Obsidian App instance.
 * @param file The TFile object from which to remove the block.
 * @param personalNoteId The unique ID of the personal note to remove.
 * @returns A Promise that resolves when the file has been modified.
 */
export async function removePersonalNoteBlockFromFile(
    app: App,
    file: TFile,
    personalNoteId: string
): Promise<void> {
    try {
        let content = await app.vault.read(file);
        const lines = content.split('\n');
        let newLines: string[] = [];
        let inPersonalNoteBlock = false;
        let foundAndRemoved = false;

        // Regular expression to find the start of a personal note block
        const blockStartRegex = /^```personal-note$/;
        // Regular expression to find the ID line within the block
        const idLineRegex = new RegExp(`^id:${personalNoteId}$`, 'i'); // Case-insensitive for 'id:'
        // Regular expression to find the end of a code block
        const blockEndRegex = /^```$/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (!inPersonalNoteBlock && blockStartRegex.test(line.trim())) {
                // Potential start of a personal note block
                // Check if the next line is the specific ID for the note we want to remove
                if (i + 1 < lines.length && idLineRegex.test(lines[i + 1].trim())) {
                    inPersonalNoteBlock = true; // We are now inside the block to be removed
                    foundAndRemoved = true;
                    // Skip this line and the ID line, and all subsequent lines until '```'
                    i++; // Skip the ID line
                    continue; // Continue to the next line after skipping
                }
            }

            if (inPersonalNoteBlock) {
                if (blockEndRegex.test(line.trim())) {
                    inPersonalNoteBlock = false; // End of the block we wanted to remove
                }
                // Skip all lines that are part of the personal note block
                continue;
            }

            // If not inside the target personal note block, add the line to newLines
            newLines.push(line);
        }

        if (foundAndRemoved) {
            const updatedContent = newLines.join('\n');
            await app.vault.modify(file, updatedContent);
            console.log(`[Personal Notes] Successfully removed block with ID '${personalNoteId}' from file '${file.path}'.`);
        } else {
            console.warn(`[Personal Notes] Personal note block with ID '${personalNoteId}' not found in file '${file.path}' or already removed.`);
        }

    } catch (error) {
        console.error(`[Personal Notes] Error removing personal note block from file '${file.path}':`, error);
        new Notice(`Failed to remove personal note block from ${file.basename}. Please check console.`, 5000);
        throw error; // Re-throw to indicate failure
    }
}
