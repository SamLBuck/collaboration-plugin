import { App, Notice } from "obsidian"; // Notice might be used for internal alerts
import MyPlugin from "../main"; // Ensure this path is correct relative to keyManager.ts

// Optional: You could simplify the settings structure in main.ts
// from keyArray[] to string[] for `keys`.
// If you stick with keyArray, this interface is needed.
interface KeyItem {
    keys: string; // The property name 'keys' is a bit confusing but matches your current setup.
                  // If you change main.ts to `keys: string[]`, you can remove this interface.
}

/**
 * Adds a new key to the plugin's collection and saves the settings.
 * @param plugin The instance of your MyPlugin class.
 * @param newKey The key string to add.
 * @returns true if the key was added, false if it already exists.
 */
export async function addKey(plugin: MyPlugin, newKey: string): Promise<boolean> {
    // Check if the key already exists (case-sensitive)
    // Using .some() for efficiency as it stops on first match
    const exists = plugin.settings.keys.some((kItem: KeyItem) => kItem.keys === newKey);
    if (exists) {
        new Notice(`Key "${newKey}" already exists.`, 3000); // Optional: Provide user feedback
        return false;
    }

    // Add the new key. If your main.ts uses `keys: string[]`, change this line to `plugin.settings.keys.push(newKey);`
    plugin.settings.keys.push({ keys: newKey });

    // *** CRITICAL FOR PERSISTENCE ***
    await plugin.saveSettings();
    new Notice(`Key "${newKey}" added.`, 3000); // Optional: Provide user feedback
    return true;
}

/**
 * Generates a random alphanumeric string of a specified length.
 * @param length The desired length of the random string.
 * @returns A random alphanumeric string.
 */
export function generateRandomString(length: number): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Generates a formatted key string and automatically adds it to the plugin's collection.
 * This function also handles saving the settings via the addKey call.
 * @param plugin The instance of your MyPlugin class.
 * @param noteName A name or identifier for the note (used in the key URL).
 * @param role The role/access type (currently unused in key format, but kept as per your original).
 * @returns The generated key string.
 */
export async function generateKey(plugin: MyPlugin, noteName: string, role: string): Promise<string> {
    // Note: The IP '192.168.1.42' and port '3010' are hardcoded here.
    // Consider making the IP dynamic (e.g., from plugin settings or user input)
    // if you intend for the server to be on different machines.
    const ip = '192.168.1.42'; // This should ideally come from plugin.settings or a user prompt
    const port = 3010;
    const randomSuffix = generateRandomString(8); // Use your random string generator

    // The 'noteName' and 'role' parameters aren't currently used in the key format,
    // but you can integrate them if you want more descriptive keys:
    // const key = `obs-collab://${ip}:${port}/note/${noteName}-${randomSuffix}`;
    const key = `obs-collab://${ip}:${port}/note/${randomSuffix}`; // Current format

    // Automatically add the generated key to the collection and save it.
    // addKey internally calls plugin.saveSettings().
    await addKey(plugin, key);

    return key;
}

/**
 * Deletes a key from the plugin's collection and saves the settings.
 * @param plugin The instance of your MyPlugin class.
 * @param keyToDelete The key string to delete.
 * @returns true if the key was deleted, false if it was not found.
 */
export async function deleteKey(plugin: MyPlugin, keyToDelete: string): Promise<boolean> {
    const originalLength = plugin.settings.keys.length;

    // Filter out the key to be deleted
    plugin.settings.keys = plugin.settings.keys.filter((kItem: KeyItem) => kItem.keys !== keyToDelete);

    // If the length is the same, no key was found and deleted
    if (plugin.settings.keys.length === originalLength) {
        new Notice(`Key "${keyToDelete}" not found.`, 3000); // Optional: Provide user feedback
        return false;
    }

    // *** CRITICAL FOR PERSISTENCE ***
    await plugin.saveSettings();
    new Notice(`Key "${keyToDelete}" deleted.`, 3000); // Optional: Provide user feedback
    return true;
}

/**
 * Returns a list of all stored keys as an array of strings.
 * @param plugin The instance of your MyPlugin class.
 * @returns An array of key strings.
 */
export function listKeys(plugin: MyPlugin): string[] {
    // Maps the array of { keys: 'string' } objects to just an array of strings
    return plugin.settings.keys.map((keyObj: KeyItem) => keyObj.keys);
}