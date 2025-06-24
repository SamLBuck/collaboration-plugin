// src/commands/createNoteCommand.ts
import { Notice } from 'obsidian';
import MyPlugin from '../main';
import { createNote } from '../utils/api';

/**
 * Registers the "Create Collaboration Note" command:
 * - Calls POST /notes to mint a new noteKey + apiKey
 * - Saves credentials into plugin settings
 */
export function registerCreateNoteCommand(plugin: MyPlugin) {
  plugin.addCommand({
    id: 'create-collab-note',
    name: 'Create Collaboration Note',
    callback: async () => {
      const { apiBaseUrl, collabId } = plugin.settings;
      if (!apiBaseUrl || !collabId) {
        new Notice('Please configure API Base URL and your Collaborator ID in settings first.', 4000);
        return;
      }
      try {
        const { noteKey, apiKey } = await createNote(apiBaseUrl, collabId);
        // Store in settings for future pulls/pushes
        plugin.settings.noteKey = noteKey;
        plugin.settings.apiKey  = apiKey;
        await plugin.saveSettings();
        new Notice(`New collaboration note created! Key: ${noteKey}`, 5000);
      } catch (err: any) {
        console.error('[CreateNote] Error:', err);
        new Notice(`Failed to create note: ${err.message}`, 5000);
      }
    }
  });
}
