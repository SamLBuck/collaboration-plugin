// storage/keyManager.ts

import { App, Notice } from "obsidian";
import MyPlugin from "../main"; // Ensure this path is correct relative to keyManager.ts
import { KeyItem } from "../main"; // *** NEW: Import KeyItem from main.ts ***

/**
 * Adds a new key item to the plugin's collection and saves the settings.
 * @param plugin The instance of your MyPlugin class.
 * @param newKeyItem The full KeyItem object to add.
 * @returns true if the key was added, false if a key with the same ID already exists.
 */
export async function addKey(plugin: MyPlugin, newKeyItem: KeyItem): Promise<boolean> {
    // Check if a key with the same ID already exists
    const exists = plugin.settings.keys.some((kItem: KeyItem) => kItem.id === newKeyItem.id);
    if (exists) {
        new Notice(`Key "${newKeyItem.id}" already exists.`, 3000);
        return false;
    }

    plugin.settings.keys.push(newKeyItem);

    await plugin.saveSettings(); // CRITICAL: Save changes to disk
    new Notice(`Key "${newKeyItem.id}" (Note: ${newKeyItem.note}, Access: ${newKeyItem.access}) added.`, 3000);
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
 * Generates a formatted key string and returns it as part of a KeyItem.
 * This function no longer *automatically* adds and saves the key; the calling
 * function (e.g., from a modal or command) will use the returned KeyItem with `addKey`.
 * @param plugin The instance of your MyPlugin class.
 * @param noteName A name or identifier for the note (used in the key URL and KeyItem).
 * @param accessType The role/access type (used in the KeyItem).
 * @returns The generated KeyItem object.
 */
export async function generateKey(plugin: MyPlugin, noteName: string, accessType: string): Promise<KeyItem> {
    const ip = '192.168.1.42'; // This should ideally come from plugin.settings or a user prompt
    const port = 3010;
    const randomSuffix = generateRandomString(8);

    // The 'noteName' is included in the key ID for clarity
    const keyId = `obs-collab://${ip}:${port}/note/${noteName.replace(/ /g, '-')}-${randomSuffix}`;

    const newKeyItem: KeyItem = {
        id: keyId,
        note: noteName,
        access: accessType
    };

    // NOTE: This function no longer calls addKey and saveSettings directly.
    // The caller of generateKey is responsible for adding the returned KeyItem.
    // This gives more control over when the key is added and saved.

    return newKeyItem;
}

/**
 * Deletes a key from the plugin's collection and saves the settings.
 * @param plugin The instance of your MyPlugin class.
 * @param keyIdToDelete The ID (string) of the key to delete.
 * @returns true if the key was deleted, false if it was not found.
 */
export async function deleteKey(plugin: MyPlugin, keyIdToDelete: string): Promise<boolean> {
    const originalLength = plugin.settings.keys.length;

    // Filter out the key to be deleted based on its 'id' property
    plugin.settings.keys = plugin.settings.keys.filter((kItem: KeyItem) => kItem.id !== keyIdToDelete);

    if (plugin.settings.keys.length === originalLength) {
        new Notice(`Key "${keyIdToDelete}" not found.`, 3000);
        return false;
    }

    await plugin.saveSettings(); // CRITICAL: Save changes to disk
    new Notice(`Key "${keyIdToDelete}" deleted.`, 3000);
    return true;
}

/**
 * Returns a list of all stored KeyItem objects.
 * @param plugin The instance of your MyPlugin class.
 * @returns An array of KeyItem objects.
 */
export function listKeys(plugin: MyPlugin): KeyItem[] {
    return plugin.settings.keys;
}