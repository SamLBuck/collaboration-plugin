import { Modal, App } from "obsidian";
import type MyPlugin from "../main";
import { renderSettingsPage } from  "./main_page01";

export class SettingsModal extends Modal {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		renderSettingsPage(contentEl, this.plugin); // show settings inside modal
	}

	onClose() {
		this.contentEl.empty(); // clean up when closing
	}
}
