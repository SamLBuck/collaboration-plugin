// src/commands/pullCommands.ts
import { App, Notice, MarkdownView } from 'obsidian';
import MyPlugin from '../main';
import { fetchMaster, pushOffer, resolveMaster } from '../utils/api';
import { CollaborationPanelView } from '../views/CollaborationPanelView';
import { COLLABORATION_VIEW_TYPE } from '../constants/viewTypes';

/**
 * Registers pull/push/resolve commands using the serverless API utils.
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
        console.log('[PullCommands] Master content:', content);
        new Notice('Master note fetched. Check console for content.');
      } catch (err) {
        console.error('[PullCommands] Failed to fetch master:', err);
        new Notice(`Failed to fetch master: ${err}`, 4000);
      }
    }
  });

  // Push collaborator offer
  plugin.addCommand({
    id: 'push-offer',
    name: 'Push Offer to Server',
    callback: async () => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        return new Notice('Open a Markdown file to push your offer.', 4000);
      }
      const content = await plugin.app.vault.read(view.file);
      const { apiBaseUrl, noteKey, apiKey, collabId } = plugin.settings;
      try {
        await pushOffer(apiBaseUrl, noteKey, apiKey, collabId, content);
        new Notice('Offer pushed successfully.');
      } catch (err) {
        console.error('[PullCommands] Failed to push offer:', err);
        new Notice(`Failed to push offer: ${err}`, 4000);
      }
    }
  });

  // Resolve master from offers
}
