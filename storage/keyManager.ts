// src/storage/keyManager.ts

import MyPlugin, { deleteNoteFromRegistry, KeyItem } from "../main";
import { getLocalIP } from "../utils/get-ip"; // Import getLocalIP to get the local IP address
//import { sendDeleteNoteToServer } from "../networking/socket/client"; // Keep if used elsewhere
import { updateNoteRegistry } from "../main"; // Keep if used elsewhere

/**
 * Generates a unique key based on the note name and local IP address.
 * This function now creates a deterministic key by concatenating these two elements.
 * The generated key is in 'IP-NoteName' format.
 *
 * @param plugin The plugin instance (not directly used for key generation, but for context).
 * @param noteName The name of the note for which the key is being generated.
 * @param accessType The type of access (e.g., "View", "Edit") associated with the key.
 * @returns A Promise that resolves to a KeyItem object containing the generated ID (as 'ip'), note name, and access type.
 */
export async function generateKey(plugin: MyPlugin, noteName: string, accessType: string): Promise<KeyItem> {
    const localIP = await getLocalIP(); // MODIFIED: Await getLocalIP() if it's async

    // Create a deterministic key ID by concatenating the local IP and sanitized note name.
    // Spaces in the note name are replaced with underscores for consistency.
    const sanitizedNoteName = noteName.replace(/\s/g, '_'); // ADDED: Sanitize note name here
    const newKeyId = `${localIP}-${sanitizedNoteName}|${accessType}`; // MODIFIED: Format is now IP-NoteName

    // Return the new KeyItem. The 'addKey' function will handle checking for duplicates
    // based on this generated ID before storing it.
    return {
        ip: newKeyId, // MODIFIED: Storing the full IP-NoteName string in the 'ip' property
        note: noteName,
        access: accessType
    };
}

/**
 * Adds a new key item to the plugin's settings.
 * This function checks if a key with the exact same ID already exists to prevent duplicates.
 *
 * @param plugin The plugin instance where the settings are stored.
 * @param newKeyItem The KeyItem object to be added to the plugin's key list.
 * @returns A Promise that resolves to `true` if the key was successfully added,
 * or `false` if a key with the same ID already exists.
 */
export async function addKey(plugin: MyPlugin, newKeyItem: KeyItem): Promise<boolean> {
    // Check if a key with the exact same ID already exists in the plugin's settings.
    const existingKey = plugin.settings.keys.find(key => key.ip === newKeyItem.ip);
    if (existingKey) {
        console.warn(`Key with ID '${newKeyItem.ip}' already exists. Not adding duplicate.`);
        return false; // Indicate that the key was not added due to duplication
    }

    // If no existing key with the same ID is found, add the new key item to the list.
    plugin.settings.keys.push(newKeyItem);
    await plugin.saveSettings(); // Persist the updated settings
    return true; // Indicate that the key was successfully added
}

/**
 * Retrieves and returns all stored key items from the plugin's settings.
 *
 * @param plugin The plugin instance from which to retrieve the keys.
 * @returns A Promise that resolves to an array of KeyItem objects.
 */
export async function listKeys(plugin: MyPlugin): Promise<KeyItem[]> {
    // Ensure plugin settings are loaded before attempting to access the keys.
    if (!plugin.settings) {
        await plugin.loadSettings();
    }
    return plugin.settings.keys; // Return the array of stored keys
}

/**
 * Deletes a key item from the plugin's settings based on its unique 'ip' string.
 * Also deletes the corresponding note from the registry.
 *
 * @param plugin The plugin instance from which to delete the key.
 * @param keyIdToDelete The full unique ID string of the key to be deleted (e.g., "IP-NoteName|AccessType").
 * @returns A Promise that resolves once the key has been deleted and settings are saved.
 */
export async function deleteKey(plugin: MyPlugin, keyIdToDelete: string): Promise<void> {
    // Filter out the key based on its unique 'ip' string
    plugin.settings.keys = plugin.settings.keys.filter(key => key.ip !== keyIdToDelete);

    // Extract the original note name from the keyIdToDelete for registry deletion
    // The format is "IP-NoteName|AccessType"
    const parts = keyIdToDelete.split('-');
    if (parts.length > 1) {
        let noteNameWithAccess = parts.slice(1).join('-'); // This will be "NoteName|AccessType"
        const noteNameParts = noteNameWithAccess.split('|');
        const originalNoteName = noteNameParts[0].replace(/_/g, ' '); // Revert sanitized underscores to spaces

        // Delete from the registry using the extracted original note name
        await deleteNoteFromRegistry(plugin, originalNoteName);
    } else {
        console.warn(`[keyManager] Could not parse note name from key ID '${keyIdToDelete}' for registry deletion.`);
    }

    // Save changes to persist the deleted key
    await plugin.saveSettings();
    console.log(`[KeyManager] Key '${keyIdToDelete}' and associated registry entry deleted.`);
}