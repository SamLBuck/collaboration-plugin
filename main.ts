import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	Modal,
	Notice,
  } from 'obsidian';
  import { registerGenerateKeyCommand } from './utils/generate_key_command';
  import { registerAddKeyCommand } from './utils/add_key_command';
  import { registerDeleteKeyCommand } from './utils/delete_key_command';
  import { requestNoteFromPeer } from './networking/socket/client';
  import { startWebSocketServer } from './networking/socket/server';
  import { PluginSettingsTab } from './settings/plugin_setting_tab';
  
  interface keyArray {
	keys: string;
  }
  
  interface MyPluginSettings {
	mySetting: string;
	keys: keyArray[];
  }
  
  const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: '',
	keys: [
	  { keys: 'obs-collab://192.168.1.42:3010/note/test' },
	],
  };
  
  export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
  
	async onload() {
	  await this.loadSettings();
  
	  // Register key commands
	  registerGenerateKeyCommand(this.app, this);
	  registerAddKeyCommand(this);
	  registerDeleteKeyCommand(this);
  
	  this.addRibbonIcon('key', 'Generate Key', () => {
		new Notice('Generate a new key!');
	  }).addClass('my-plugin-ribbon-class');
  
	  this.addRibbonIcon('settings', 'Settings', async () => {
		const { SettingsModal } = await import('./settings/main_page01');
		new SettingsModal(this.app, this).open();
	  });
  
	  this.addRibbonIcon('list', 'View Keys', async () => {
		const { KeyListModal } = await import('./settings/key_list_page02');
		new KeyListModal(this.app, this).open();
	  });
  
	  this.addRibbonIcon('link', 'Link Notes', async () => {
		const { LinkNoteModal } = await import('./settings/link_note_page03');
		new LinkNoteModal(this.app, this).open();
	  });
  
	  this.addCommand({
		id: 'generate-share-key',
		name: 'Generate Share Key',
		callback: async () => {
		  const ip = await this.getUserIp('Enter your IP address:');
		  const key = 'my-shared-note';
		  const shareLink = `obs-collab://${ip}:3010/note/${key}`;
		  startWebSocketServer(this.app, shareLink, 3010);
		  await navigator.clipboard.writeText(shareLink);
		  new Notice('Share key copied to clipboard');
		},
	  });
  
	  this.addCommand({
		id: 'pull-note-from-peer',
		name: 'Pull Note from Peer',
		callback: async () => {
		  const shareKey = window.prompt('Paste the share key:');
		  if (!shareKey) return;
  
		  try {
			const { ip, port, key } = parseShareKey(shareKey);
			const wsUrl = `ws://${ip}:${port}`;
			const content = await requestNoteFromPeer(wsUrl, key);
			await this.app.vault.create('Pulled Note.md', content);
			new Notice('Note pulled and created.');
		  } catch (e) {
			new Notice('Failed to pull note: ' + e);
		  }
		},
	  });
  
	  function parseShareKey(shareKey: string): { ip: string; port: number; key: string } {
		const match = shareKey.match(/^obs-collab:\/\/([\d.]+):(\d+)\/note\/(.+)$/);
		if (!match) throw new Error('Invalid share key format');
		return { ip: match[1], port: parseInt(match[2]), key: match[3] };
	  }
  
	  this.addCommand({
		id: 'publish',
		name: 'Update Version',
		callback: () => {
		  this.publishVersion();
		},
	  });
  
	  this.addSettingTab(new PluginSettingsTab(this.app, this));
  
	  this.registerDomEvent(document, 'click', (evt: MouseEvent) => {});
  
	  this.registerInterval(window.setInterval(() => console.log('Interval running'), 5 * 60 * 1000));
	}
  
	async getUserIp(promptText: string): Promise<string> {
	  return await new Promise((resolve) => {
		const ip = window.prompt(promptText, '192.168.1.42');
		resolve(ip ?? '127.0.0.1');
	  });
	}
  
	onunload() {
	  new Notice('Plugin is unloading!');
	  this.publishVersion();
	}
  
	async loadSettings() {
	  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
  
	async saveSettings() {
	  await this.saveData(this.settings);
	}
  
	async publishVersion() {
	  new Notice('Publishing new version...');
	}
  }

class SampleSettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Setting #1')
      .setDesc('This is a secret setting')
      .addText((text) =>
        text
          .setPlaceholder('Enter your secret')
          .setValue(this.plugin.settings.mySetting)
          .onChange(async (value) => {
            this.plugin.settings.mySetting = value;
            await this.plugin.saveSettings();
          })
      );
  }
}


