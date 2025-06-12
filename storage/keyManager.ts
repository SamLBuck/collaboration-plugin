// storage/keyManager.ts

// Assuming these imports are present in your actual keyManager.ts file
// You might need to adjust the path for MyPlugin based on your file structure.
import MyPlugin, { KeyItem } from '../main';
import { Notice } from 'obsidian'; // Import Notice for error/success messages
import { getLocalIP } from '../utils/get-ip'; // Assuming getLocalIP is defined here or imported
import { deleteNoteFromRegistry } from './registryStore';


// --- Existing functions (example structure - replace with your actual implementations) ---
export async function generateKey(plugin: MyPlugin, noteName: string, accessType: string): Promise<KeyItem> {
    const localIp = await getLocalIP(); // Or however you get the IP
    // For simplicity, let's just combine them for the 'key' (ip property)
    const newIpKey = `${localIp}-${noteName}|${accessType}`;
    
    // In a real scenario, you might want more robust key generation,
    // e.g., cryptographic hash, or a server-generated key.
    
    return {
        ip: newIpKey, // This is the full key string
        note: noteName,
        access: accessType,
    };
}

export async function addKey(plugin: MyPlugin, keyItem: KeyItem): Promise<boolean> {
    // Check for duplicate key (based on 'ip' property which holds the full key string)
    const exists = plugin.settings.keys.some(k => k.ip === keyItem.ip);
    if (exists) {
        console.warn(`[KeyManager] Key '${keyItem.ip}' already exists. Not adding.`);
        return false;
    }
    
    plugin.settings.keys.push(keyItem);
    await plugin.saveSettings();
    console.log(`[KeyManager] Added new key: ${keyItem.ip}`);
    return true;
}

// You might also have a function to delete a specific key (not comprehensive)
export async function deleteSpecificKey(plugin: MyPlugin, keyString: string): Promise<boolean> {
    const initialLength = plugin.settings.keys.length;
    plugin.settings.keys = plugin.settings.keys.filter(item => item.ip !== keyString);
    await plugin.saveSettings();
    if (plugin.settings.keys.length < initialLength) {
        new Notice(`Key '${keyString}' removed from your generated keys.`);
        return true;
    } else {
        new Notice(`Key '${keyString}' not found in your generated keys.`, 3000);
        return false;
    }
}

// --- NEW: Comprehensive delete function for Push notes ---
export async function deleteKeyAndContent(plugin: MyPlugin, noteName: string): Promise<boolean> {
    console.log(`[KeyManager] Initiating comprehensive delete for note: '${noteName}'`);

    let keyItemRemoved = false;
    // 1. Remove the KeyItem from plugin.settings.keys
    const initialKeysLength = plugin.settings.keys.length;
    plugin.settings.keys = plugin.settings.keys.filter(item => {
        const shouldKeep = item.note !== noteName;
        if (!shouldKeep) {
            console.log(`[KeyManager] Removing KeyItem: ${item.ip}`);
            keyItemRemoved = true; // Mark that at least one key item was removed
        }
        return shouldKeep;
    });

    // 2. Remove the content from plugin.settings.registry using the existing deleteNoteFromRegistry function
    //    Note: deleteNoteFromRegistry expects the 'key' (which is the noteName in the registry context)
    console.log(`[KeyManager] Calling deleteNoteFromRegistry for note content: '${noteName}'`);
    await deleteNoteFromRegistry(plugin, noteName); 

    // 3. Save the updated settings
    await plugin.saveSettings();
    
    if (keyItemRemoved) {
        console.log(`[KeyManager] Comprehensive delete successful for note: '${noteName}'. Key item and registry content removed.`);
    } else {
        console.warn(`[KeyManager] Comprehensive delete: No matching KeyItem found for note: '${noteName}'. Only registry content (if any) was targeted.`);
    }
    return keyItemRemoved; // Returns true if a KeyItem was found and removed
}
