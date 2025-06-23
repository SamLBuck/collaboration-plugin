// src/commands/pullCommands.ts

import { App, Notice, TFile } from "obsidian";
import MyPlugin from "../main";
import { tempIPInputModal } from "../settings/tempIPInputModal";
import { requestNoteFromPeer } from "../networking/socket/client";
import { ReceivedPushConfirmation } from "../settings/ReceivedPushConfirmation";
import { updateNoteRegistry } from "../storage/registryStore";
import { stripPersonalNoteBlocks } from "./stripPersonalNotes";
import { NoteManager } from "../networking/socket/NoteManager";

// This helper is for INTERNAL FILE MATCHING IN OBSIDIAN'S VAULT,
// acknowledging Obsidian's implicit filename sanitization (e.g., spaces to underscores).
// It does NOT sanitize the key for server communication, as the server expects the original name.
function getPotentialFilenames(userProvidedKey: string): string[] {
    const originalFilename = `${userProvidedKey}.md`;
    // Common Obsidian sanitization: space to underscore, often retaining apostrophes.
    const sanitizedFilename = `${userProvidedKey.replace(/\s/g, '_')}.md`;
    // More aggressive sanitization (if Obsidian does more than just spaces or apostrophes, e.g., strips apostrophe)
    const aggressiveSanitizedFilename = `${userProvidedKey.replace(/[^a-zA-Z0-9_']/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}.md`;

    // Return in order of preference/likelihood
    const potentialNames = [originalFilename]; // Try original first
    if (sanitizedFilename !== originalFilename) {
        potentialNames.push(sanitizedFilename); // Then the common space-to-underscore
    }
    if (aggressiveSanitizedFilename !== originalFilename && aggressiveSanitizedFilename !== sanitizedFilename) {
        potentialNames.push(aggressiveSanitizedFilename); // Then a more aggressive, just in case
    }
    // Remove duplicates if any (e.g., if original is already "Jon_s_Note")
    return [...new Set(potentialNames)];
}

async function findNoteFileInVault(app: App, userProvidedKey: string): Promise<TFile | null> {
    const potentialPaths = getPotentialFilenames(userProvidedKey);

    for (const path of potentialPaths) {
        const file = app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            console.log(`[PullCommands] Found existing file: ${path} for key: ${userProvidedKey}`);
            return file;
        }
    }
    console.log(`[PullCommands] No existing file found for key: '${userProvidedKey}' with potential paths: ${potentialPaths.join(', ')}`);
    return null;
}


export function registerPullNoteCommand(app: App, plugin: MyPlugin) {
    plugin.addCommand({
        id: "pull-note-from-peer-modal",
        name: "Pull Note from Server Registry (enter key and IP) (NEW)",
        callback: async () => {
            new tempIPInputModal(app, async (ip: string, key: string) => {
                // Pass the raw user-provided key. Server will handle it as is (no sanitization).
                await pullNoteFromPeerNewNote(app, ip, key);
            }).open();
        },
    });

    plugin.addCommand({
        id: "rewrite-existing-note",
        name: "Rewrite Existing Note (enter key and IP)",
        callback: async () => {
            new tempIPInputModal(app, async (ip: string, key: string) => {
                // Pass the raw user-provided key.
                await rewriteExistingNote(app, ip, key, plugin);
            }).open();
        },
    });

    plugin.addCommand({
        id: "overwrite-current-note",
        name: "Overwrite Current Note (enter key and IP)",
        callback: async () => {
            new tempIPInputModal(app, async (ip: string, key: string) => {
                // Pass the raw user-provided key.
                await overwriteCurrentNote(app, ip, key);
            }).open();
        },
    });
}

// pullNoteFromPeerNewNote will try to create a new file
export async function pullNoteFromPeerNewNote(app: App, ip: string, key: string) {
    try {
        // 'key' here is the raw user input (e.g., "Jon's Note"). Send it directly to server.
        const content = await requestNoteFromPeer(`ws://${ip}:3010`, key);
        
        // Find the most likely filename Obsidian would create/expect for this key.
        // This is still subject to Obsidian's internal filename sanitization,
        // but we'll try to provide the most original name possible for creation.
        const potentialFilenamesForCreation = getPotentialFilenames(key);
        const desiredFilenamePath = potentialFilenamesForCreation[0]; 

        // Check if a file representing this note already exists (e.g., Jon's Note.md OR Jon's_Note.md)
        const existingFileCheck = await findNoteFileInVault(app, key);
        if (existingFileCheck) {
            new Notice(`Note '${existingFileCheck.basename}' already exists for key '${key}'. Use 'Rewrite Existing Note' to overwrite or delete it first.`);
            return;
        }

        // Create the new note. Obsidian will apply its own sanitization here.
        // So, if `desiredFilenamePath` is 'Jon's Note.md', the actual file created might be 'Jon's_Note.md'.
        await app.vault.create(desiredFilenamePath, content);
        new Notice(`Note '${key}' pulled and created as '${desiredFilenamePath}'.`); // Clarify the actual filename
    } catch (err) {
        console.error("Failed to pull note:", err);
        new Notice(`Failed to pull note: ${err}`);
    }
}

// rewriteExistingNote will try to find and overwrite an existing file
// export async function  rewriteExistingNote(app: App, ip: string, key: string) {
//     try {
//         const content = await requestNoteFromPeer(`ws://${ip}:3010`, key);
        
//         // Find the existing file in the vault, considering Obsidian's potential renaming
//         const existingFile = await findNoteFileInVault(app, key);

//         if (existingFile) {
//             await app.vault.modify(existingFile, content);
//             new Notice(`Note '${key}' pulled and rewritten as '${existingFile.basename}'.`);
//         } else {
//             new Notice(`Note based on '${key}' not found in vault. Cannot rewrite. Consider using 'Pull Note (NEW)' to create it.`);
//         }
//     } catch (err) {
//         console.error("Failed to rewrite note:", err);
//         new Notice(`Failed to rewrite note: ${err}`);
//     }
// }
export async function rewriteExistingNote(app: App, ip: string, key: string, plugin: MyPlugin) {
	try {
		let incoming = await requestNoteFromPeer(`ws://${ip}:3010`, key);
		let existingFile = await findNoteFileInVault(app, key);

		if (!existingFile) {
			new Notice(`Note based on '${key}' not found in vault. Cannot rewrite. Consider using 'Pull Note (NEW)' to create it.`);
			return;
		}


		let local = await app.vault.read(existingFile);

        incoming = stripPersonalNoteBlocks(incoming)
        local = stripPersonalNoteBlocks(local)

        
		const userAccepted = await new Promise<{ confirmed: boolean; content?: string }>((resolve) => {
			new ReceivedPushConfirmation(
				app,
				`Note "${key}.md" already exists. Overwrite it with the pulled content?`,
				local,
				incoming,
                ((confirmed: boolean, editedContent?: string) => {
                    resolve({ confirmed, content: editedContent });
                }) as (confirmed: boolean, editedContent?: string) => void
            ).open();
		});

		if (!userAccepted.confirmed || !userAccepted.content) {
			new Notice(`Pull cancelled for '${key}'.`, 3000);
			return;
		}

		await app.vault.modify(existingFile, userAccepted.content);
		new Notice(`Note '${key}' pulled and updated as '${existingFile.basename}'.`, 3000);

        const existing = plugin.keys.find(k => k.note === key);
        if (!existing) {
            plugin.keys.push({
                ip: ip,
                note: key,
                view: "Edit" // or whatever permission you want
            });
            await plugin.saveData({ keys: plugin.keys });
            console.log('[rewriteExistingNote] Added pulled key:', { ip, note: key });
        }

		if (plugin) {
             if (plugin.noteManager) {
                await plugin.noteManager.restorePersonalNotesIntoActiveFileNoteManager();
             }
			await updateNoteRegistry(plugin, key, userAccepted.content);
		}

	} catch (err) {
		console.error("Failed to rewrite note:", err);
		new Notice(`Failed to rewrite note: ${err}`, 5000);
	}
}


export async function overwriteCurrentNote(app: App, ip: string, key: string) {
    try {
        // 'key' here is the raw user input (e.g., "Jon's Note"). Send it directly to server.
        let content = await requestNoteFromPeer(`ws://${ip}:3010`, key);
        const activeFile = app.workspace.getActiveFile();

        if (activeFile) {
            await app.vault.modify(activeFile, content);
            new Notice(`Current note overwritten with content from '${key}'.`);
        } else {
            new Notice("No active note to overwrite.");
        }
    } catch (err) {
        console.error("Failed to overwrite current note:", err);
        new Notice(`Failed to overwrite current note: ${err}`);
    }
}