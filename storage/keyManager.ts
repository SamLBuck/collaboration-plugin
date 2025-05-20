// keyManager.ts

let keyStore: Set<string> = new Set();

// Generate a random key (optional)
export function generateKey(noteId: string, accessType: string, length: number = 32): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "";
  for (let i = 0; i < length; i++) {
    key += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  keyStore.add(key);
  return key;
}

// Add your own custom key
export function addKey(customKey: string): boolean {
  if (keyStore.has(customKey)) return false; // Key already exists
  keyStore.add(customKey);
  return true;
}

// Delete a key
export function deleteKey(key: string): boolean {
  return keyStore.delete(key);
}

// List all keys
export function listKeys(): string[] {
  return Array.from(keyStore);
}
