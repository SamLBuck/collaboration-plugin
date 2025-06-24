import { createNote } from '../utils/api';

export async function generateKey(
  plugin: MyPlugin,
  noteName: string,       // you can ignore this or pass it as metadata
  accessType: string      // same
): Promise<KeyItem> {
  const { noteKey, apiKey } = await createNote(
    plugin.settings.apiBaseUrl,
    plugin.settings.collabId
  );
  return { ip: apiKey, note: noteKey, access: accessType };
}
