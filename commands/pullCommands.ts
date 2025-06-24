// src/commands/pullCommands.ts
import { Notice, MarkdownView } from 'obsidian';
import MyPlugin from '../main';
import { fetchMaster, pushOffer, resolveMaster } from '../utils/api';
import { COLLABORATION_VIEW_TYPE } from '../constants/viewTypes';

/**
 * Registers collaboration commands using HTTP API helpers.
 */
export function registerPullCommands(plugin: MyPlugin) {
  // Pull master note
  plugin.addCommand({
    id: 'pull-master',
    name: 'Pull Master Note',
    callback: async () => {
      const { apiBaseUrl, noteKey, apiKey } = plugin.settings;
      try {
        const content = await fetchMaster(apiBaseUrl, noteKey, apiKey);
        console.log('[Pull] Master content:', content);
        new Notice('Master note fetched. See console.');
      } catch (err) {
        console.error('[Pull] Error fetching master:', err);
        new Notice(`Failed to pull master: ${err.message}`, 4000);
      }
    }
  });

  // Push current content as an offer
  plugin.addCommand({
    id: 'push-offer',
    name: 'Push Offer to Server',
    callback: async () => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        new Notice('Open a Markdown file to push your offer.', 3000);
        return;
      }
      if (!view.file) {
        new Notice('No file is currently open.', 3000);
        return;
      }
      const content = await plugin.app.vault.read(view.file);
      const { apiBaseUrl, noteKey, apiKey, collabId } = plugin.settings;
      try {
        await pushOffer(apiBaseUrl, noteKey, apiKey, collabId, content);
        new Notice('Offer pushed successfully.', 3000);
      } catch (err) {
        console.error('[Push] Error pushing offer:', err);
        new Notice(`Failed to push offer: ${err.message}`, 4000);
      }
    }
  });

  // Open resolve panel (actual resolve happens in the view)
  plugin.addCommand({
    id: 'open-resolve-panel',
    name: 'Open Resolve Panel',
    callback: () => {
      this.plugin.activateView(COLLABORATION_VIEW_TYPE);
    }
  });
}
