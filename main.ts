import { App, Plugin, PluginSettingTab, Setting, Modal, Notice } from 'obsidian';
import { registerGenerateKeyCommand } from './commands/generate_key_command';
import { registerAddKeyCommand } from './commands/add_key_command';
import { registerDeleteKeyCommand } from './commands/delete_key_command';
import { requestNoteFromPeer } from './networking/socket/client';

interface MyPluginSettings {
  mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  mySetting: 'default',
};

export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;

  async onload() {
    await this.loadSettings();

    // Register key commands
    registerGenerateKeyCommand(this.app, this);
    registerAddKeyCommand(this);
    registerDeleteKeyCommand(this);

    // Ribbon: Generate Key
    this.addRibbonIcon('key', 'Generate Key', () => {
      new Notice('Generate a new key!');
    }).addClass('my-plugin-ribbon-class');

    // Ribbon: Open Settings Modal
    this.addRibbonIcon('settings', 'Settings', async () => {
      const { SettingsModal } = await import('./settings/main_page01');
      new SettingsModal(this.app, this).open();
    });

    // Ribbon: View Key List
    this.addRibbonIcon('list', 'View Keys', async () => {
      const { KeyListModal } = await import('./settings/key_list_page02');
      new KeyListModal(this.app, this).open();
    });

    // Ribbon: Link Note Modal
    this.addRibbonIcon('link', 'Link Notes', async () => {
      const { LinkNoteModal } = await import('./settings/link_note_page03');
      new LinkNoteModal(this.app, this).open();
    });

    // Pull note from peer command
    this.addCommand({
      id: "pull-note-from-peer",
      name: "Pull Note from Peer (ws://localhost:3010)",
      callback: async () => {
        try {
          const content = await requestNoteFromPeer("ws://localhost:3010", "test");
          const file = await this.app.vault.create("Pulled Note.md", content);
          new Notice("Note pulled and created.");
        } catch (e) {
          new Notice("Failed to pull note: " + e);
        }
      }
    });

    // Publish version command
    this.addCommand({
      id: 'publish',
      name: 'Update Version',
      callback: () => {
        this.publishVersion();
      },
    });

    // Plugin settings tab
    this.addSettingTab(new SampleSettingTab(this.app, this));

    // Register any global events if needed
    this.registerDomEvent(document, 'click', (evt: MouseEvent) => {});

    // Background task
    this.registerInterval(window.setInterval(() => console.log('Interval running'), 5 * 60 * 1000));
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
    // TODO: Add your real publish logic here
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