// storage/keyManager.ts
import { App, normalizePath, TFile } from "obsidian";

const keysFilePath = normalizePath("plugins/collaborative-plugin/keys.json");

export async function generateKey(app: App, noteId: string, accessType: string, length: number = 32): Promise<string> {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "";
  for (let i = 0; i < length; i++) {
    key += charset.charAt(Math.floor(Math.random() * charset.length));
  }

  await addKey(app, key);
  return key;
}

export async function addKey(app: App, customKey: string): Promise<boolean> {
  const keys = await getAllKeys(app);
  if (keys[customKey]) return false;
  keys[customKey] = customKey;
  await saveKeys(app, keys);
  return true;
}

export async function getAllKeys(app: App): Promise<Record<string, string>> {
  const file = app.vault.getAbstractFileByPath(keysFilePath);
  if (file && file instanceof TFile) {
    const content = await app.vault.read(file);
    try {
      return JSON.parse(content);
    } catch {
      return {};
    }
  }
  return {};
}

export async function deleteKey(app: App, keyName: string): Promise<boolean> {
  const keys = await getAllKeys(app);
  if (!(keyName in keys)) return false;
  delete keys[keyName];
  await saveKeys(app, keys);
  return true;
}

export async function listKeys(app: App): Promise<string[]> {
  const keys = await getAllKeys(app);
  return Object.keys(keys);
}

async function saveKeys(app: App, keys: Record<string, string>) {
  const file = app.vault.getAbstractFileByPath(keysFilePath);
  const json = JSON.stringify(keys, null, 2);

  if (file && file instanceof TFile) {
    await app.vault.modify(file, json);
  } else {
    await app.vault.create(keysFilePath, json);
  }
}
