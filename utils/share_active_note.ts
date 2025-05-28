import { Plugin, Notice, TFile } from "obsidian";
import { App } from "obsidian";
import { registerNoteWithPeer } from "../networking/socket/client";

export async function shareCurrentNote(app: App): Promise<void> {
	const file = app.workspace.getActiveFile();
	if (!file) {
		new Notice("No active file.");
		return;
	}

	const content = await app.vault.read(file);
	const key = file.basename;

	registerNoteWithPeer("ws://localhost:3010", key, content);
	new Notice(`Note '${key}' added to peer accessible registry.`);
}

export async function shareCurrentNoteWithFileName(app: App, fileName: string): Promise<void> {
	const file = app.vault.getAbstractFileByPath(`${fileName}.md`);
	if (!file) {
		new Notice("No active file.");
		return;
	}

	if (!(file instanceof TFile)) {
        new Notice(`'${file}' is not a readable file.`, 3000);
        return;
    }
	
	try {
        const content = await app.vault.read(file);
        const key = fileName;

		registerNoteWithPeer("ws://localhost:3010", key, content);
		new Notice(`Note '${key}' added to peer accessible registry.`);
	}
	catch (error: any) {
        console.error("Error sharing note by filename:", error);
        new Notice(`Failed to share note '${fileName}': ${error.message || error}`, 5000);
    }
}

export function registerShareCurrentNoteCommand(plugin: Plugin) {
	plugin.addCommand({
		id: "share-current-note",
		name: "Register Active Note",
		callback: () => {
			shareCurrentNote(plugin.app);
		}
	});
}

export async function updateRegistry(app: App, key: string): Promise<void> {
	const file = app.vault.getFiles().find((f) => f.basename === key);
	if (!file) {
		new Notice(`File with key '${key}' not found.`);
		return;
	}

	const content = await app.vault.read(file);
	registerNoteWithPeer("ws://localhost:3010", key, content);
	new Notice(`Registry updated for note '${key}'.`);
}

import { Modal, Setting } from "obsidian";

class PromptModal extends Modal {
	private resolve: (value: string | null) => void;
	private placeholder: string;
	private inputValue: string = "";

	constructor(app: App, placeholder: string, resolve: (value: string | null) => void) {
		super(app);
		this.placeholder = placeholder;
		this.resolve = resolve;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Input Required" });

		new Setting(contentEl)
			.setName(this.placeholder)
			.addText((text) =>
				text.onChange((value) => {
					this.inputValue = value; // Store the input value
				})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Submit")
					.setCta()
					.onClick(() => {
						this.resolve(this.inputValue); // Resolve with the stored input value
						this.close();
					})
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}

export function registerUpdateRegistryCommand(plugin: Plugin) {
	plugin.addCommand({
		id: "update-registry",
		name: "Update Registry for Note",
		callback: async () => {
		const key = await new Promise<string | null>((resolve) => {
			const promptModal = new PromptModal(plugin.app, "Enter the key of the note to update:", resolve);
			promptModal.open();
		});
		if (key) {
			updateRegistry(plugin.app, key);
		}
	}
})
}