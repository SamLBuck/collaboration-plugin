import { ItemView, WorkspaceLeaf } from 'obsidian';

export const VIEW_TYPE_SETTINGS = "my-plugin-settings-view";

export class SidebarSettingsView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE_SETTINGS;
	}

	getDisplayText() {
		return "My Plugin Settings";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

		container.createEl('h2', { text: 'Plugin Settings' });

		// Recreate your settings UI here
		container.createEl('label', { text: 'Some setting:' });
		container.createEl('input', { type: 'checkbox' });
	}

	async onClose() {
		// Cleanup if needed
	}
}
