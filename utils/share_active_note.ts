// utils/share_active_note.ts
import { Plugin, Notice, TFile, App } from "obsidian"; // Ensure App is imported here as well
import MyPlugin from '../main'; // Assuming MyPlugin is imported
import { updateNoteRegistry } from '../main'; // Assuming updateNoteRegistry is imported
import { registerNoteWithPeer } from "../networking/socket/client"; // Keep this import

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

export async function shareCurrentNoteWithFileName(plugin: MyPlugin, app: App, fileName: string): Promise<void> {
    // Find the TFile object corresponding to the targetFileName by its basename.
    // This approach is more robust as it doesn't assume the file's exact path
    // beyond its name and markdown extension.
    const file = app.vault.getMarkdownFiles().find(f => f.basename === fileName);

    if (!file) {
        new Notice(`Error: Note "${fileName}.md" not found in your vault. Content not added to registry.`, 4000);
        console.warn(`[Share Note] Target note "${fileName}.md" not found. Content not added to registry.`);
        return;
    }

    if (!(file instanceof TFile)) {
        // This check is good practice, though getMarkdownFiles() should return TFiles.
        new Notice(`'${fileName}' is not a readable file.`, 3000);
        return;
    }
    
    try {
        console.log("Found file:", file, "Type:", file instanceof TFile);
        const content = await app.vault.read(file);
        console.log("Note content read for registry update:", content);

        const key = fileName; // The key is already the file's basename

        registerNoteWithPeer("ws://localhost:3010", key, content);
        await updateNoteRegistry(plugin, key, content); // Use await here for async operation

        new Notice(`Note '${key}' added to list, check Key List for confirmation!.`);
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


