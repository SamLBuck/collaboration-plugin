import { Modal, App, TFile, normalizePath, Notice } from "obsidian";
import type MyPlugin from "../main";
import { SettingsModal } from "./main_page01";

export class LinkNoteModal extends Modal {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Link Note" });

		// Input field for the key
		const keyInput = contentEl.createEl("input", {
			type: "text",
			placeholder: "Enter key for note...",
		});

		// Button to link & create note
		const linkBtn = contentEl.createEl("button", {
			text: "Link & Create Note",
		});
		linkBtn.onclick = async () => {
			const key = keyInput.value.trim();
			if (!key) {
				new Notice("Please enter a valid key.");
				return;
			}

			const fileName = `Shared-${key}.md`;
			const filePath = normalizePath(fileName);

			try {
				let file = this.app.vault.getAbstractFileByPath(filePath);
				if (!file) {
					file = await this.app.vault.create(filePath, `# Shared Note for Key: ${key}\n`);
				}
				this.app.workspace.openLinkText(filePath, "/", true);
				this.close();
			} catch (err) {
				console.error("Failed to create or open note:", err);
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
