// settings/plugin_settings_tab.ts
import { PluginSettingTab, App, Setting } from "obsidian";
import MyPlugin from "../main";
import { SettingsModal } from "./main_page01";
import { KeyListModal } from "./key_list_page02";
import { LinkNoteModal } from "./link_note_page03";

export class PluginSettingsTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Collaborative Plugin Settings" });

		new Setting(containerEl)
			.setName("Open Settings Modal")
			.setDesc("View and edit main plugin settings.")
			.addButton((btn) =>
				btn.setButtonText("Open").onClick(() => {
					new SettingsModal(this.app, this.plugin).open();
				})
			);

		new Setting(containerEl)
			.setName("View Keys")
			.setDesc("Manage all registered keys.")
			.addButton((btn) =>
				btn.setButtonText("Open").onClick(() => {
					new KeyListModal(this.app, this.plugin).open();
				})
			);

		new Setting(containerEl)
			.setName("Link Notes")
			.setDesc("Manually link a key to a note.")
			.addButton((btn) =>
				btn.setButtonText("Open").onClick(() => {
					new LinkNoteModal(this.app, this.plugin).open();
				})
			);
	}
}
