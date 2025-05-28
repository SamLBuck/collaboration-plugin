import MyPlugin, { KeyItem } from "../main";
import { getLocalIP } from "../utils/get-ip"; // Import getLocalIP to get the local IP address

/**
 * Generates a unique key based on the note name and local IP address.
 * This function now creates a deterministic key by concatenating these two elements.
 *
 * @param plugin The plugin instance, used to access plugin settings if needed.
 * @param noteName The name of the note for which the key is being generated.
 * @param accessType The type of access (e.g., "View", "Edit") associated with the key.
 * @returns A Promise that resolves to a KeyItem object containing the generated ID, note name, and access type.
 */
export async function generateKey(plugin: MyPlugin, noteName: string, accessType: string): Promise<KeyItem> {
    const localIP = getLocalIP(); // Get the current local IP address

    // Create a deterministic key ID by concatenating the note name and local IP.
    // Spaces in the note name are replaced with underscores for consistency.
    const newKeyId = `${noteName.replace(/\s/g, '_')}-${localIP}`; // Corrected format: NoteName-IPAddress

    // Return the new KeyItem. The 'addKey' function (below) will handle checking for duplicates
    // based on this generated ID before storing it.
    return {
        ip: newKeyId,
        note: noteName,
        access: accessType // Access type is still stored with the KeyItem, just not part of the ID
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
 * Deletes a key item from the plugin's settings based on its ID.
 *
 * @param plugin The plugin instance from which to delete the key.
 * @param keyId The ID of the key to be deleted.
 * @returns A Promise that resolves once the key has been deleted and settings are saved.
 */
export async function deleteKey(plugin: MyPlugin, keyId: string): Promise<void> {
    // Filter out the key with the specified ID, effectively deleting it.
    plugin.settings.keys = plugin.settings.keys.filter(key => key.ip !== keyId);
    await plugin.saveSettings(); // Persist the updated settings
}