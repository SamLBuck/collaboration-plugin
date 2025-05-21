import { Modal, App } from "obsidian";
import type MyPlugin from "../main";
import { SettingsModal } from "./main_page01";

// You can replace this with real settings or storage later
let keyData = [
	{ key: "abc123", note: "Project Plan", access: "View" },
	{ key: "xyz789", note: "Team Notes", access: "Edit" },
];

export class KeyListModal extends Modal {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Key List" });

		// List all keys
		keyData.forEach((entry, index) => {
			const row = contentEl.createDiv({ cls: "key-row" });
			row.createSpan({
				text: `${entry.key} | ${entry.note} | ${entry.access}`,
			});

			const delBtn = row.createEl("button", { text: "Delete key" });
			delBtn.onclick = () => {
				keyData.splice(index, 1);
				this.onOpen(); // re-render
			};
		});

		// Add key form
		contentEl.createEl("h3", { text: "Add New Key" });
		const keyInput = contentEl.createEl("input", { placeholder: "Key name..." });
		const noteInput = contentEl.createEl("input", { placeholder: "Note name..." });
		const accessSelect = contentEl.createEl("select");
		["View"].forEach((type) => {
			accessSelect.createEl("option", { text: type });
		});
        //, "Edit", "Comment", "Edit w/ Approval" will come later

		const addBtn = contentEl.createEl("button", { text: "Add Key" });
		addBtn.onclick = () => {
			if (keyInput.value && noteInput.value) {
				keyData.push({
					key: keyInput.value,
					note: noteInput.value,
					access: accessSelect.value,
				});
				this.onOpen();
			}
		};

		// Back button
		const backBtn = contentEl.createEl("button", { text: "⬅ Back" });
		backBtn.onclick = () => {
			this.close();
			new SettingsModal(this.app, this.plugin).open();
		};
	}

	onClose() {
		this.contentEl.empty();
	}
}
