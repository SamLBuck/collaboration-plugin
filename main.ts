import { requestNoteFromPeer } from 'networking/socket/client';
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// check the URI type to see user access priveliges 
				//TODO

		// onload of the note, the notes text and info should be updated by pulling 
				
		// available database information from the URI

		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			new Notice('This is a notice!');
		});
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		this.addCommand({
			id: 'publish',
			name: 'Update Version',
				// TODO
		});
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
		  
		  
		this.addSettingTab(new SampleSettingTab(this.app, this));

		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		});
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

		//onunload should call our publish command, or at least give a popup to do that
		
		this.addCommand({
			id: 'publish',
			name: 'Update Version',
				// TODO
		});

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}

// This is Jonathan
