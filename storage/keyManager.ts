// src/storage/keyManager.ts

import MyPlugin, { KeyItem } from "../main"; // Removed deleteNoteFromRegistry import as it's no longer called here
import { getLocalIP } from "../utils/get-ip"; 
// import { sendDeleteNoteToServer } from "../networking/socket/client"; // Keep if used elsewhere
// import { updateNoteRegistry } from "../main"; // Keep if used elsewhere

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
    const localIP = await getLocalIP();
    // const sanitizedNoteName = noteName.replace(/\s/g, '_'); // REMOVE OR COMMENT OUT THIS LINE
    const newKeyId = `${localIP}-${noteName}|${accessType}`; // USE noteName DIRECTLY
    return {
        ip: newKeyId,
        note: noteName, // Keep original note name here too for KeyItem.note
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
    const existingKey = plugin.settings.keys.find(key => key.ip === newKeyItem.ip);
    if (existingKey) {
        console.warn(`Key with ID '${newKeyItem.ip}' already exists. Not adding duplicate.`);
        return false;
    }
    plugin.settings.keys.push(newKeyItem);
    await plugin.saveSettings();
    return true;
}

/**
 * Retrieves and returns all stored key items from the plugin's settings.
 *
 * @param plugin The plugin instance from which to retrieve the keys.
 * @returns A Promise that resolves to an array of KeyItem objects.
 */
export async function listKeys(plugin: MyPlugin): Promise<KeyItem[]> {
    if (!plugin.settings) {
        await plugin.loadSettings();
    }
    return plugin.settings.keys;
}

/**
 * Deletes a key item from the plugin's settings based on its unique 'ip' string.
 * This function now ONLY handles deleting the key from the keys list.
 * It DOES NOT affect the note registry.
 *
 * @param plugin The plugin instance from which to delete the key.
 * @param keyIdToDelete The full unique ID string of the key to be deleted (e.g., "IP-NoteName|AccessType").
 * @returns A Promise that resolves once the key has been deleted and settings are saved.
 */
export async function deleteKey(plugin: MyPlugin, keyIdToDelete: string): Promise<void> {
    // Filter out the key based on its unique 'ip' string
    plugin.settings.keys = plugin.settings.keys.filter(key => key.ip !== keyIdToDelete);

    // REMOVED: The logic to extract noteName and call deleteNoteFromRegistry is removed from here.
    // This function will no longer automatically delete from the registry.
    // The responsibility for deleting from the registry is now completely separate.

    // Save changes to persist the deleted key
    await plugin.saveSettings();
    console.log(`[KeyManager] Key '${keyIdToDelete}' deleted from keys list.`);
}