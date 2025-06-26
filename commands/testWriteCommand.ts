import { Notice, MarkdownView } from 'obsidian';
import MyPlugin from '../main';
import { testWrite } from '../utils/api';

export function registerTestWriteCommand(plugin: MyPlugin) {
  plugin.addCommand({
    id: 'test-write-to-dynamo',
    name: 'Test Write to DynamoDB',
    callback: async () => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        return new Notice('Open a Markdown file to test-write its text.', 3000);
      }
      if (!view.file) {
        new Notice('No file is currently open.', 3000);
        return;
      }
      const content = await plugin.app.vault.read(view.file);
      try {
        const { apiBaseUrl, noteKey, apiKey } = plugin.settings;
        if (!apiKey) {
          new Notice('API Key is not configured. Please set it in the plugin settings.', 4000);
          return;
        }
        await testWrite(
          apiBaseUrl,
          noteKey,
          apiKey,
          content.slice(0, 1000) // limit size
        );
        new Notice('Wrote test record to DynamoDB!', 3000);
      } catch (e:any) {
        new Notice('testWrite error: ' + e.message, 5000);
      }
    }
  });
}
