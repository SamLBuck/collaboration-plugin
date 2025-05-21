// keyManager.ts

import * as fs from "fs";
import * as path from "path";

const keysFile = path.resolve(__dirname, "keys.json");

export function generateKey(noteId: string, accessType: string, length: number = 32): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "";
  for (let i = 0; i < length; i++) {
    key += charset.charAt(Math.floor(Math.random() * charset.length));
  }

  // Save generated key in a collection (or you can modify this part)
  addKey(key); // assuming addKey is defined elsewhere to store the key
  
  return key;
}

// Add a key
export function addKey(customKey: string): boolean {
  const keys = getAllKeys();
  if (keys[customKey]) return false; // Key already exists
  keys[customKey] = customKey;
  fs.writeFileSync(keysFile, JSON.stringify(keys, null, 2));
  return true;
}

// Get all keys from storage
export function getAllKeys(): Record<string, string> {
  if (!fs.existsSync(keysFile)) return {};
  return JSON.parse(fs.readFileSync(keysFile, "utf-8"));
}

// Delete a key
export function deleteKey(keyName: string): boolean {
  const keys = getAllKeys();
  if (!(keyName in keys)) return false;
  delete keys[keyName];
  fs.writeFileSync(keysFile, JSON.stringify(keys, null, 2), "utf-8");
  return true;
}

// List all keys
export function listKeys(): string[] {
  return Object.keys(getAllKeys());
}
 